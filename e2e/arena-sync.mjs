/**
 * Teste de aceite da arena: lutador A, lutador B e um ESPECTADOR abrem a mesma luta
 * em janelas separadas e todos veem exatamente a mesma cena (movimentos, animações,
 * ataques, projéteis e efeitos de AMBOS os lutadores).
 *
 * Como rodar (com o servidor no ar):
 *   BASE_URL=http://localhost:3000 node e2e/arena-sync.mjs
 * Requer Playwright (npx playwright install chromium).
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const tag = Math.random().toString(36).slice(2, 7);
const browser = await chromium.launch();
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✖'} ${msg}`);
  if (!ok) failures++;
};

async function newUser(name, weapon) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  // modo de teste: permite pausar/pular (?t=, ?pause=) mesmo com a luta ao vivo
  await ctx.addInitScript(() => { window.__gbE2E = true; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const r = await page.request.post(`${BASE}/api/auth/register`, {
    data: { email: `${name}_${tag}@e2e.dev`, username: `${name}_${tag}`, password: 'senha12345' },
  });
  if (!r.ok()) throw new Error(`cadastro falhou: ${await r.text()}. O cadastro público precisa estar ligado.`);
  const id = (await r.json()).user.id;
  if (weapon) await page.request.post(`${BASE}/api/shop/starter`, { data: { weaponId: weapon } });
  return { page, id, errors };
}

const A = await newUser('lutadorA', 'espada-curta-recruta');
const B = await newUser('lutadorB', 'cajado-aprendiz');
const S = await newUser('espectador', 'selo-do-novico');

// A desafia B; B aceita e a luta (automática) é simulada no servidor
const ch = await (await A.page.request.post(`${BASE}/api/ranking/challenges`, { data: { defenderId: B.id } })).json();
const res = await B.page.request.post(`${BASE}/api/ranking/challenges/${ch.challenge.id}/accept`);
const { battle } = await res.json();
console.log(`Luta ${battle.id} (${battle.durationSec}s, mapa ${battle.map})`);

const replay = await (await A.page.request.get(`${BASE}/api/battles/${battle.id}/replay`)).json();
const pick = (pred) => replay.events.find(pred);
const moments = [
  ['ataque do lutador A', pick((e) => e.type === 'attack' && e.p === 0 && e.t > 40)],
  ['ataque do lutador B', pick((e) => e.type === 'attack' && e.p === 1 && e.t > 40)],
  ['projétil em voo', pick((e) => e.type === 'proj')],
  ['acerto', pick((e) => e.type === 'hit')],
  ['KO', pick((e) => e.type === 'ko')],
].filter(([, e]) => e);

const all = [
  ['lutador A', A.page],
  ['lutador B', B.page],
  ['espectador', S.page],
];

for (const [label, ev] of moments) {
  const t = ev.t + (ev.windup ?? 0) + 2;
  const images = [];
  for (const [, page] of all) {
    await page.goto(`${BASE}/luta/${battle.id}?t=${t}&pause=1`);
    await page.waitForFunction(() => window.__gbArena);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__gbArena.render?.());
    if (!(await page.$('canvas'))) console.log('sem canvas em', page.url(), (await page.content()).slice(0, 300));
    images.push(await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png')));
  }
  const same = images.every((img) => img === images[0]);
  check(same, `${label} (tick ${t}): as 3 telas mostram pixels idênticos`);
}

// reprodução ao vivo nas 3 janelas ao mesmo tempo: cada uma processa os ataques dos DOIS lutadores
await Promise.all(all.map(([, p]) => p.goto(`${BASE}/luta/${battle.id}`)));
await Promise.all(all.map(([, p]) => p.waitForFunction(() => window.__gbArena?.playing)));
await Promise.all(all.map(([, p]) => p.evaluate(() => (window.__gbArena.speed = 4))));
await A.page.waitForTimeout(3500);
for (const [label, page] of all) {
  const seen = await page.evaluate(() => {
    const p = window.__gbArena;
    const ev = p.replay.events.filter((e) => e.type === 'attack' && e.t <= p.simT);
    return { a: ev.filter((e) => e.p === 0).length, b: ev.filter((e) => e.p === 1).length, t: Math.round(p.simT) };
  });
  check(seen.a > 0 && seen.b > 0, `${label} ao vivo viu ataques de A (${seen.a}) e de B (${seen.b}) até o tick ${seen.t}`);
}
for (const [label, , errors] of [['A', null, A.errors], ['B', null, B.errors], ['espectador', null, S.errors]]) {
  check(errors.length === 0, `sem erros de JavaScript (${label})${errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''}`);
}

await browser.close();
if (failures) {
  console.error(`\n${failures} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('\nTudo certo: todos veem exatamente a mesma luta.');
