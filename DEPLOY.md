# Colocando o GymBattle no ar (Hostinger)

Guia passo a passo para o plano **Unlimited Web Hosting** da Hostinger, usando o recurso
**Sites Node.js**. Não precisa de VPS: as lutas são automáticas e não usam WebSocket.

Tempo estimado: 20–30 minutos.

---

## 1. Tenha o código em mãos

Você tem dois caminhos. **O mais fácil é o A.**

**A) Enviar o zip direto para a Hostinger (sem GitHub)**
Use o arquivo `GymBattle-codigo.zip` como está (não descompacte). No passo 4, escolha
**Upload your files / Enviar arquivos** em vez de "Importar repositório Git".
Para atualizar depois, é só enviar um zip novo.

**B) Pelo GitHub (atualiza sozinho a cada envio)**
- Jeito mais simples: abra uma **nova tarefa no Claude com o repositório
  `graficapiixel-ux/GymBattle` selecionado como fonte** e peça para enviar o código — aí o
  envio é automático.
- Pelo site do GitHub: o upload aceita até 100 arquivos por vez, então envie em duas levas
  (primeiro as pastas `client` e `shared`, depois o resto).

## 2. Crie o banco de dados MySQL

1. hPanel → **Sites** → escolha o site principal → **Bancos de dados** → **Gerenciamento de bancos de dados MySQL**.
2. Crie um banco, um usuário e uma senha forte. Anote os três.
3. O "host" normalmente é `localhost`.

Monte o endereço do banco assim (troque os valores):

```
mysql://USUARIO:SENHA@localhost:3306/NOME_DO_BANCO
```

> Se a senha tiver caracteres especiais (`@ : / ? # %`), troque por letras e números
> ou use a versão "codificada" (ex.: `@` vira `%40`).

## 3. Escolha o endereço do site

Duas opções:

- **Subdomínio da sua loja** (recomendado): `gymbattle.piixelimpressaodigital.com` — crie em
  hPanel → Domínios → Subdomínios.
- **Domínio novo** (ex.: `gymbattle.com.br`), usando um dos domínios adicionais do plano.

## 4. Crie o Site Node.js

1. hPanel → **Sites** → **Adicionar site** → **Node.js web app** (ou "Deploy Web App").
2. Caminho A: escolha **Enviar arquivos** e envie o `GymBattle-codigo.zip`.
   Caminho B: escolha **Importar repositório Git** → **Autorizar** o GitHub → selecione **GymBattle**.
3. Preencha as configurações de build:

| Campo | Valor |
| --- | --- |
| Framework | **Other** (ou Express) |
| Branch | `main` |
| Node.js | **22** |
| Gerenciador de pacotes | **npm** |
| Comando de build | `npm run build` |
| Arquivo de entrada (entry file) | `server.js` |
| Diretório de saída | deixe em branco (ou `server/dist`, se for obrigatório) |

4. Em **Variáveis de ambiente**, adicione:

| Nome | Valor |
| --- | --- |
| `DATABASE_URL` | o endereço do passo 2 |
| `JWT_SECRET` | um texto aleatório com 64+ caracteres (ex.: gere em https://www.random.org/strings/) |
| `ADMIN_PASSWORD` | a senha que você quer para `lucasmartins2216@gmail.com` (8+ caracteres) |
| `PUBLIC_URL` | `https://seu-endereco` (ex.: `https://gymbattle.piixelimpressaodigital.com`) |

> **Não** crie `NODE_ENV`. O servidor já se configura como produção sozinho.

5. Clique em **Deploy** e aguarde o build terminar (2–5 minutos).

Na primeira vez que o servidor sobe, ele:

- cria todas as tabelas no banco (migrations automáticas);
- cria a sua conta de administrador com o e-mail `lucasmartins2216@gmail.com` e a senha do `ADMIN_PASSWORD`;
- guarda as fotos em `~/gymbattle-data/uploads` (fora da pasta do build, então não somem a cada deploy).

## 5. Ligue o domínio e o HTTPS

1. No painel do site Node.js, conecte o subdomínio/domínio do passo 3.
2. Ative o **SSL** (Let's Encrypt, grátis) em hPanel → Segurança → SSL.

## 6. Teste

1. Abra o endereço no celular.
2. Entre com `lucasmartins2216@gmail.com` e a senha do `ADMIN_PASSWORD`.
3. Toque em **Baixar app** para instalar.
4. Em **Perfil → Painel admin**, decida se o cadastro público fica aberto.

## Atualizações

- Caminho A (zip): envie o zip novo no painel do site Node.js → **Deploy**.
- Caminho B (GitHub): toda vez que um código novo entrar na branch `main`, a Hostinger reconstrói
  e publica sozinha. O GitHub Actions (aba **Actions**) roda os testes a cada envio.

As fotos e o banco não são apagados em nenhuma atualização.

## Problemas comuns

| Sintoma | O que fazer |
| --- | --- |
| Build falhou | Abra **Deployments** → log do build (a Hostinger sugere a correção). Confira se o Node é 22. |
| "Variáveis de ambiente inválidas" no log | Falta `DATABASE_URL` ou `JWT_SECRET` (mínimo 32 caracteres). |
| Não consigo entrar como admin | Confira `ADMIN_PASSWORD` e reinicie o app. A conta é criada na primeira subida. |
| Erro de banco | Confira usuário/senha/nome no `DATABASE_URL` e se o usuário tem permissão no banco. |
| Notificação no iPhone não chega | No iPhone só funciona com o app instalado (Baixar app) e iOS 16.4 ou mais novo. |

## Alternativa: VPS

Se um dia quiser uma VPS (mais controle e desempenho), o mesmo projeto roda com
`npm ci && npm run build && node server.js` atrás de um Nginx com HTTPS. Não é necessário hoje.
