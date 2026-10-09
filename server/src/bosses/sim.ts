/**
 * Luta contra o boss (servidor). O RESULTADO JÁ VEM SORTEADO (`won`): aqui só
 * montamos uma luta convincente que termina daquele jeito — o time causa e
 * leva dano de forma natural, alguns caem, e no fim ou o boss tomba no golpe
 * final, ou derruba o último guerreiro (quase sempre com o boss já ferido).
 */
import {
  ELEMENT_COLOR, WEAPONS_BY_ID, derivedStats, mulberry32,
  type BossEv, type BossPlayerMeta, type BossReplay, type BossSpec, type FighterInput,
} from '@gymbattle/shared';

const ENTRANCE = 4.2;

function styleOf(weaponId: string | null | undefined): BossPlayerMeta['style'] {
  const w = weaponId ? WEAPONS_BY_ID[weaponId] : undefined;
  if (!w) return 'melee';
  if (w.category === 'bow') return 'ranged';
  if (w.category === 'staff' || w.category === 'seal') return 'magic';
  return 'melee';
}

export function simulateBossFight(opts: { boss: BossSpec; fighters: FighterInput[]; won: boolean; seed: number }): BossReplay {
  const { boss, fighters, won, seed } = opts;
  const rng = mulberry32(seed);
  const R = (a: number, b: number) => a + (b - a) * rng();
  const n = fighters.length;

  const players: BossPlayerMeta[] = fighters.map((f) => {
    const w = f.equipment.weapon ? WEAPONS_BY_ID[f.equipment.weapon] : undefined;
    return {
      id: f.id, username: f.username, level: f.level, look: f.look, equipment: f.equipment,
      maxHp: derivedStats(f.attributes).maxHp,
      style: styleOf(f.equipment.weapon),
      color: w ? ELEMENT_COLOR[w.element] : '#ffffff',
    };
  });
  const power = fighters.map((f) => {
    const w = f.equipment.weapon ? WEAPONS_BY_ID[f.equipment.weapon] : undefined;
    return (w?.baseDamage ?? 30) * (1 + f.level * 0.04);
  });
  const avgLevel = fighters.reduce((s, f) => s + f.level, 0) / n;
  const bossHp = Math.round((1800 + 900 * n) * (1 + avgLevel / 25) / 50) * 50;

  // ---------------------------------------------------------------- 1. ataques do boss
  const fightLen = Math.min(78, 30 + 3.2 * n + R(0, 8));
  let T = ENTRANCE + fightLen;
  const atks = boss.attacks;
  const order: number[] = [];
  // todos os ataques aparecem pelo menos uma vez, em ordem embaralhada; depois, aleatórios
  const deck = atks.map((_, i) => i).sort(() => rng() - 0.5);
  const bossActs: { t: number; a: number; dur: number; hitAt: number }[] = [];
  let bt = ENTRANCE + R(1.0, 1.8);
  while (true) {
    const a = deck.length ? deck.shift()! : Math.floor(rng() * atks.length);
    const dur = atks[a].dur;
    if (bt + dur > T + 0.01) break;
    bossActs.push({ t: bt, a, dur, hitAt: bt + dur * 0.55 });
    order.push(a);
    bt += dur + R(1.4, 2.6);
  }
  if (!bossActs.length) bossActs.push({ t: ENTRANCE + 1, a: 0, dur: atks[0].dur, hitAt: ENTRANCE + 1 + atks[0].dur * 0.55 });

  // na derrota, o último ataque é o golpe final: o ataque em área mais longo
  if (!won) {
    const finisher = atks.map((x, i) => ({ x, i })).filter((o) => o.x.aoe).sort((p, q) => q.x.dur - p.x.dur)[0]?.i ?? 0;
    const last = bossActs[bossActs.length - 1];
    last.a = finisher;
    last.dur = atks[finisher].dur;
    last.hitAt = last.t + last.dur * 0.55;
    T = last.hitAt;
  }

  // ---------------------------------------------------------------- 2. quem cai e quando
  const koAt = new Array<number>(n).fill(Infinity); // índice do ataque do boss que derruba
  const koAct = new Array<number>(n).fill(-1);
  if (won) {
    // vitória: no máximo 1 a cada 3 cai (nunca o time todo)
    const k = Math.min(Math.floor((n - 1) / 3), n - 1);
    const idx = Array.from({ length: n }, (_, i) => i).sort(() => rng() - 0.5).slice(0, rng() < 0.6 ? k : Math.max(0, k - 1));
    for (const p of idx) {
      const j = Math.floor(R(bossActs.length * 0.35, bossActs.length * 0.85));
      koAct[p] = Math.min(bossActs.length - 1, Math.max(0, j));
    }
  } else {
    // derrota: vão caindo ao longo da segunda metade; o golpe final leva o resto
    const idx = Array.from({ length: n }, (_, i) => i).sort(() => rng() - 0.5);
    const lastJ = bossActs.length - 1;
    idx.forEach((p, r) => {
      if (r === idx.length - 1 || bossActs.length < 3) koAct[p] = lastJ;
      else koAct[p] = Math.min(lastJ, Math.floor(R(bossActs.length * 0.45, bossActs.length * 0.98)));
    });
    // pelo menos 1 sobrevive até o golpe final (fica dramático)
    if (!koAct.some((j) => j === lastJ)) koAct[idx[idx.length - 1]] = lastJ;
  }
  for (let p = 0; p < n; p++) if (koAct[p] >= 0) koAt[p] = bossActs[koAct[p]].hitAt;

  // ---------------------------------------------------------------- 3. ataques dos jogadores
  const pActs: { t: number; p: number; dur: number; hitAt: number; w: number; crit: boolean; slot: 1 | 2 }[] = [];
  for (let p = 0; p < n; p++) {
    const st = players[p].style;
    const base = st === 'melee' ? 1.25 : st === 'ranged' ? 0.95 : 1.1;
    let t = ENTRANCE + 0.5 + R(0, 1.4) + p * 0.17;
    while (true) {
      const slot: 1 | 2 = rng() < 0.3 ? 2 : 1;
      const dur = base * (slot === 2 ? 1.25 : 1);
      const hitAt = t + dur * 0.55;
      if (hitAt >= koAt[p] - 0.15 || hitAt > T - 0.05) break;
      const crit = rng() < 0.14;
      pActs.push({ t, p, dur, hitAt, crit, slot, w: power[p] * R(0.8, 1.2) * (crit ? 1.8 : 1) * (slot === 2 ? 1.5 : 1) });
      t += dur + R(0.7, 1.6);
    }
  }
  pActs.sort((a, b) => a.hitAt - b.hitAt);

  if (won) {
    // o boss cai no último golpe de quem ainda está de pé, perto do fim
    const standing = pActs.filter((a) => koAt[a.p] === Infinity);
    const killer = standing[standing.length - 1] ?? pActs[pActs.length - 1];
    killer.crit = true;
    killer.w *= 2.2;
    T = killer.hitAt;
    // remove o que acontece depois do golpe final
    for (let i = pActs.length - 1; i >= 0; i--) if (pActs[i].hitAt > T + 1e-6 || (pActs[i] !== killer && pActs[i].t > T - 0.2)) pActs.splice(i, 1);
    for (let i = bossActs.length - 1; i >= 0; i--) if (bossActs[i].hitAt > T - 0.3) bossActs.splice(i, 1);
    // ninguém cai num ataque que não aconteceu
    for (let p = 0; p < n; p++) if (koAct[p] >= bossActs.length) koAct[p] = -1, koAt[p] = Infinity;
  }

  // dano dos jogadores: soma exata
  const dealt = won ? bossHp : Math.round(bossHp * R(0.62, 0.9)); // na derrota o boss sobra com 10–38%
  const wsum = pActs.reduce((s, a) => s + a.w, 0) || 1;
  let acc = 0;
  const pDmg = pActs.map((a, i) => {
    if (i === pActs.length - 1) return Math.max(1, dealt - acc);
    const d = Math.max(1, Math.round((a.w / wsum) * dealt));
    acc += d;
    return d;
  });
  // garante que o boss não morra antes do fim (vitória) ou nunca (derrota)
  let run = 0;
  for (let i = 0; i < pDmg.length; i++) {
    const cap = won && i < pDmg.length - 1 ? bossHp - 1 - run - (pDmg.length - 1 - i) : bossHp - 1 - run;
    if (!won || i < pDmg.length - 1) pDmg[i] = Math.max(1, Math.min(pDmg[i], cap));
    run += pDmg[i];
  }
  if (won) pDmg[pDmg.length - 1] = bossHp - (run - pDmg[pDmg.length - 1]);

  // ---------------------------------------------------------------- 4. dano do boss
  const hp = players.map((p) => p.maxHp);
  const events: BossEv[] = [];
  bossActs.forEach((b, j) => {
    const alive = Array.from({ length: n }, (_, i) => i).filter((i) => hp[i] > 0 && koAt[i] >= b.hitAt - 1e-6);
    if (!alive.length) return;
    const dying = alive.filter((i) => koAct[i] === j);
    let targets: number[];
    if (atks[b.a].aoe) targets = alive;
    else {
      const extra = alive.filter((i) => !dying.includes(i)).sort(() => rng() - 0.5).slice(0, dying.length ? 0 : Math.min(alive.length, rng() < 0.5 ? 1 : 2));
      targets = [...dying, ...extra];
    }
    const dmg = targets.map((i) => {
      if (koAct[i] === j) return hp[i];
      // sobrevive: tira um pedaço, mas nunca tudo (quem cai depois vai sendo "preparado")
      const later = koAct[i] > j;
      const frac = atks[b.a].aoe ? R(0.08, 0.2) : R(0.15, 0.32);
      const d = Math.round(hp[i] * (later ? frac * 1.25 : frac));
      return Math.max(1, Math.min(hp[i] - Math.max(1, Math.round(players[i].maxHp * 0.06)), d));
    });
    targets.forEach((i, k) => (hp[i] -= dmg[k]));
    events.push({ t: r2(b.t), type: 'bAtk', a: b.a, dur: b.dur, hitAt: r2(b.hitAt), targets, dmg });
    targets.forEach((i) => hp[i] <= 0 && events.push({ t: r2(b.hitAt + 0.05), type: 'pKo', p: i }));
  });

  pActs.forEach((a, i) => events.push({ t: r2(a.t), type: 'pAtk', p: a.p, dur: r2(a.dur), hitAt: r2(a.hitAt), dmg: pDmg[i], crit: a.crit, slot: a.slot }));

  const endAt = won ? T + 4.2 : T + 3.2;
  if (won) events.push({ t: r2(T + 0.05), type: 'bDie' });
  events.push({ t: r2(endAt), type: 'end', won });
  events.sort((a, b) => a.t - b.t || (a.type === 'pKo' ? 1 : 0) - (b.type === 'pKo' ? 1 : 0));

  return { v: 1, seed, won, duration: r2(endAt + 0.4), entrance: ENTRANCE, boss, bossHp, players, events };
}

const r2 = (x: number) => Math.round(x * 100) / 100;
