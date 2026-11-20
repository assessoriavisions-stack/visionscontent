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
  scripts/limparProjeto.js apaga Auth + Firestore do projeto (limpeza do sistema antigo)
assets/                    logo
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

Projeto Firebase: `visionscontent-cba52` (reaproveitado do sistema antigo, plano Blaze).

1. **Config web:** no Console, Configurações do projeto > Seus apps > Configuração do SDK.
   Cole `apiKey`, `messagingSenderId` e `appId` em `FIREBASE_CONFIG` no `index.html`
   (esses valores são públicos; a segurança vem das regras e das functions).
2. **Authentication:** confirme que o login por E-mail/senha está ativo.
3. **Limpar o sistema antigo** (apaga TODOS os usuários do Auth e TODAS as coleções do Firestore):
   ```bash
   gcloud auth application-default login
   cd functions && npm install
   node scripts/limparProjeto.js --confirmar visionscontent-cba52
   ```
4. **Deploy do backend** (regras do Firestore + functions). Se o projeto antigo tinha outras
   functions, o CLI vai perguntar se quer apagá-las: responda que sim.
   ```bash
   firebase deploy --only firestore:rules,functions
   ```
5. **Primeiro admin:**
   ```bash
   cd functions && node scripts/definirAdmin.js seu@email.com SenhaInicial123
   ```
6. **Frontend:** publique a raiz do repositório no Netlify. Ao entrar como admin, toque em
   **Criar agora** no aviso de configurações iniciais (ou rode `node scripts/seed.js`).
7. **Chave da Anthropic** (usada a partir da Fase 2), no Secret Manager:
   `firebase functions:secrets:set ANTHROPIC_API_KEY`.

Os scripts de `functions/scripts/` usam o projeto do `.firebaserc` (ou `GOOGLE_CLOUD_PROJECT`, se definido).

## Visual

Identidade da Visions: vermelho `#DD2A2A`, amarelo `#FFCF51` e azul `#2657A5` do logo, fundo marfim,
títulos em Fraunces (serifada) e texto em Inter. A faixa tricolor do logo aparece no topo dos cartões
e do cabeçalho. Logo em `assets/logo-visions.png`.

## Rodar local e testar

```bash
cd testes && npm install && npm test
```

O teste sobe os emuladores (Auth, Firestore, Functions) e verifica o aceite da Fase 1: cliente bloqueado
não loga, não lê nem escreve nada e não chama functions, mesmo com a sessão aberta antes do bloqueio;
desbloqueio devolve os dados intactos; vencimento passado bloqueia na primeira chamada.

Para usar a interface local: `firebase emulators:start` e sirva o `index.html` em `localhost`
(ex.: `npx serve .`). Em `localhost` o app se conecta sozinho aos emuladores.
