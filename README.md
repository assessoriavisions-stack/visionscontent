# Plataforma de Roteiros Visions

Plataforma web em que clientes da Visions Marketing geram roteiros para Instagram com a voz de cada perfil.
Frontend em um único `index.html` (React + Babel via CDN, no Netlify) e backend no Firebase
(Auth, Firestore, Cloud Functions v2 em Node 20, Scheduler e FCM).

## Status

- [x] **Fase 1: base, acesso e admin**
- [ ] Fase 2: DNA do perfil
- [ ] Fase 3: geração + trava anti-linguagem de IA
- [ ] Fase 4: editor
- [ ] Fase 5: postado, métricas e diagnóstico
- [ ] Fase 6: lembretes (PWA + push)
- [ ] Fase 7: campanhas
- [ ] Fase 8: admin avançado

## Estrutura

```
index.html                 app inteiro (login, admin, cliente)
firestore.rules            regras de acesso (bloqueio checado em toda leitura/escrita)
firebase.json              functions + firestore + emuladores
netlify.toml               publicação do frontend
functions/
  index.js                 exporta as functions
  admin.js                 callables do admin + rotinas agendadas de acesso
  lib/middleware.js        checagem de login, status ativo, vencimento e limite mensal
  lib/tempo.js             datas no fuso de Brasília
  config/seedPadrao.js     valores iniciais de config/travaAntiIA e config/benchmarks
  scripts/seed.js          cria a config pela linha de comando
  scripts/definirAdmin.js  dá o papel de admin a um e-mail
testes/                    teste ponta a ponta contra os emuladores
```

## Functions da Fase 1

| Function | Tipo | O que faz |
|---|---|---|
| `adminCriarCliente` | callable (admin) | cria login com senha provisória e `clientes/{uid}` |
| `adminAtualizarCliente` | callable (admin) | nome, @, vencimento, limite mensal |
| `adminBloquearCliente` | callable (admin) | status `bloqueado` + `disabled` no Auth + revoga tokens |
| `adminDesbloquearCliente` | callable (admin) | caminho inverso (recusa se o vencimento já passou) |
| `adminRedefinirSenha` | callable (admin) | gera nova senha provisória e derruba as sessões |
| `adminInicializarConfig` | callable (admin) | cria `config/*` se faltar (nunca sobrescreve) |
| `verificarVencimentos` | agendada, 03:00 BRT | bloqueia quem passou de `venceEm` |
| `resetarContadorMensal` | agendada, dia 1 00:05 BRT | zera `geracoesNoMes` |
| `clienteVerificarAcesso` | callable (cliente) | callable mínima que passa pelo middleware do cliente |

Toda callable de cliente usa `callableCliente()`, que checa login, `status === "ativo"`, vencimento
(bloqueia na hora se já passou) e, quando `consomeGeracao: true`, o limite mensal.

## Configuração inicial (uma vez)

1. Crie o projeto no Firebase (plano Blaze, exigido por Functions/Scheduler/Secret Manager) e ative
   Authentication > E-mail/senha e o Firestore (região `southamerica-east1`).
2. Troque o id do projeto em `.firebaserc` e cole a config web do projeto em `FIREBASE_CONFIG` no `index.html`.
3. Deploy do backend:
   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only firestore:rules,functions
   ```
4. Defina o primeiro admin (precisa de credencial do projeto, ex.: `gcloud auth application-default login`):
   ```bash
   cd functions && node scripts/definirAdmin.js seu@email.com SenhaInicial123
   ```
5. Publique a raiz do repositório no Netlify. Ao entrar como admin, toque em **Criar agora** no aviso de
   configurações iniciais (ou rode `node scripts/seed.js`).
6. A chave da Anthropic (usada a partir da Fase 2) vai no Secret Manager:
   `firebase functions:secrets:set ANTHROPIC_API_KEY`.

## Rodar local e testar

```bash
cd testes && npm install && npm test
```

O teste sobe os emuladores (Auth, Firestore, Functions) e verifica o aceite da Fase 1: cliente bloqueado
não loga, não lê nem escreve nada e não chama functions, mesmo com a sessão aberta antes do bloqueio;
desbloqueio devolve os dados intactos; vencimento passado bloqueia na primeira chamada.

Para usar a interface local: `firebase emulators:start` e sirva o `index.html` em `localhost`
(ex.: `npx serve .`). Em `localhost` o app se conecta sozinho aos emuladores.
