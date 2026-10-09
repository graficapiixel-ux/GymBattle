# Balanceamento por simulação

Scripts usados para equilibrar as 160 armas (rodar da raiz do projeto):

```bash
node --import tsx tools/balance/paths.ts 12,24,36,52,78,99 8 5   # Força × Destreza × Inteligência × Fé por nível
node --import tsx tools/balance/suicide.ts 40                      # IA se jogando da arena (deve ser ~0)
node --import tsx tools/balance/minlv.ts                           # nível em que cada caminho alcança cada raridade
node --import tsx tools/balance/tune.ts 10 14 4 tools/balance/out/t.out common,uncommon,rare,epic,legendary
```

`tune.ts` faz cada arma lutar contra as da mesma raridade e ajusta o dano até ~50% de vitórias.
O resultado (multiplicadores relativos aos valores atuais) deve ser multiplicado pelos valores de
`shared/src/items/tuning.ts`.
