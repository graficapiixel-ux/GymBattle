# ⚔️ GymBattle

Rede social de academia + RPG de luta. **Treine → poste a foto → ganhe XP e ouro → evolua seu
guerreiro → lute na arena → suba no ranking.** A progressão é lenta de propósito: quem vence é
quem vai à academia todo dia.

- **Feed** de fotos de treino (somem após 7 dias), curtidas, comentários, denúncias.
- **1 post recompensado por dia** (fuso de Brasília), streak de até +50%, 1 dia de descanso por semana.
- **Anti-trapaça**: fotos repetidas bloqueadas por hash perceptual, admin marca fotos como FAKE
  (estorna XP/ouro, zera streak, fica no log).
- **Avatar** 2D esquelético em camadas: pele, cabelo, barba, rosto, corpo. Todos têm o mesmo hitbox.
- **Loja progressiva**: 160 armas (todos os caminhos com vários tipos) e 30 armaduras que aparecem conforme seus atributos/nível. O filtro só mostra tipos e raridades já desbloqueados.
- **Arena automática**: a luta é simulada no servidor por IA com a sua build; todos (lutadores e
  espectadores) assistem ao **mesmo replay**, com as mesmas animações e efeitos.
- **Ranking** por PR: até 5 desafios por dia; recusar ou não responder em 24 h passa um pouco de PR para o desafiante; quem perde PR fica 36 h protegido (desafiar alguém cancela a proteção); temporadas mensais com prêmios e PR de todos volta para 1000.
- **Notificações** no app e push no celular; **PWA** instalável (Android, iPhone e PC).

## Estrutura

```
gymbattle/
├── shared/              # Código usado pelo servidor E pelo cliente
│   └── src/
│       ├── balance.ts   ← TODOS os números do jogo (ajuste aqui)
│       ├── items/       ← 160 armas (weapons.ts + arsenal.ts, ajuste fino em tuning.ts) e 30 armaduras (armors.ts)
│       ├── battle/      ← simulação da luta, IA e mapas
│       └── ranking.ts   ← regras de PR e temporada
├── server/              # Node + Express + Prisma (MySQL)
├── client/              # React + Vite + Tailwind (PWA, mobile-first)
│   └── src/game/        ← avatar (rig.ts) e renderizador da arena (arena/)
├── e2e/arena-sync.mjs   # teste: 3 janelas veem a mesma luta
├── server.js            # entrada de produção (Hostinger: "Entry file")
└── DEPLOY.md            # como colocar no ar
```

## Rodando localmente

Requisitos: Node 20+ e MySQL 8 ou MariaDB 10.6+.

```bash
npm install
cp .env.example .env          # preencha DATABASE_URL, JWT_SECRET e ADMIN_PASSWORD
npm run db:migrate            # cria as tabelas
npm run db:seed               # cria a conta admin (lucasmartins2216@gmail.com)
npm run dev                   # API em :3000 + site em :5173
```

Abra http://localhost:5173. No celular (mesma rede Wi-Fi), use o IP do computador: `http://192.168.x.x:5173`.

### Testes

```bash
npm run typecheck
npm test                      # regras do jogo (shared) + API completa (server, precisa do banco)
npm run build && npm start    # sobe a versão de produção em :3000
BASE_URL=http://localhost:3000 npm run e2e:arena   # A, B e espectador veem pixels idênticos
```

## Colocando no ar

Veja **[DEPLOY.md](DEPLOY.md)** (passo a passo para a Hostinger, sem precisar de VPS).

## Ajustando o balanceamento

Tudo fica em [`shared/src/balance.ts`](shared/src/balance.ts) e em [`shared/src/items/`](shared/src/items).
Altere o número, envie para o GitHub e a Hostinger publica sozinha. Nenhuma lógica precisa mudar.

| Quero… | Altere |
| --- | --- |
| Post render mais XP/ouro | `post.baseXp` / `post.baseGold` |
| Streak dar até +100% | `streak.maxBonus: 1` |
| Fotos durarem 14 dias | `post.photoRetentionDays` |
| Lutas renderem mais | `fights.winXp`, `fights.winGold`, `fights.rewardedPerDay` |
| Curva de nível mais lenta | `levels.xpBase`, `levels.xpPerLevel` |
| Mais vida nas lutas | `attributes.baseHp`, `attributes.hpPerVigor` |
| Redistribuir pontos mais barato | `attributes.respec` |
| Loja revelar armas mais cedo | `shop.revealMargin` |
| Armaduras aparecerem em outro nível | `shop.armorRevealLevel` |
| Desconto do conjunto completo | `shop.armorSetDiscount` |
| Pontos de ranking | `ranking.*` (vitórias/derrotas, desafios por dia, multa por recusar, proteção, prêmios, reset) |
| Dano de uma arma específica | `shared/src/items/tuning.ts` (multiplicador calculado por simulação) |
| Efeitos (veneno, fogo, paralisia) | `combat.status` |
| Preço/dano/requisito de uma arma | `shared/src/items/weapons.ts` |
| Preço de uma armadura | `shared/src/items/armors.ts` |

## Variáveis de ambiente

Veja [`.env.example`](.env.example). Nunca faça commit do `.env`.

## Fases

- [x] **Fase 1**: estrutura, banco, login/cadastro, admin (cadastro liga/desliga, criar/excluir contas, log), PWA, layout mobile, atributos e redistribuição de pontos
- [x] **Fase 2**: feed, posts com foto (WebP, sem GPS, anti-duplicata), curtidas, comentários, denúncias, "marcar como fake", XP/ouro/streak, fotos apagadas após 7 dias
- [x] **Fase 3**: avatar esquelético 2D em camadas, editor de aparência, arma inicial grátis, loja progressiva com 160 armas e 30 armaduras, inventário e equipamento
- [x] **Fase 4**: lutas automáticas controladas por IA (simulação determinística no servidor + replay idêntico para todos), 4 mapas, animações e efeitos
- [x] **Fase 5**: ranking por PR, desafios, lutas ranqueadas com XP/ouro (5 por dia), anti-farm, temporadas mensais com prêmios e soft reset, lutas ao vivo, notificações
- [x] **Fase 6**: deploy na Hostinger (Sites Node.js, migrations e admin automáticos), CI no GitHub Actions, documentação
