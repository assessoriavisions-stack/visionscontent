# Plataforma de Roteiros Visions

Plataforma web em que clientes da Visions Marketing geram roteiros para Instagram com a voz de cada perfil.
Frontend em um único `index.html` (React + Babel via CDN, no Netlify) e backend no Firebase
(Auth, Firestore, Cloud Functions v2 em Node 22, Scheduler e FCM).

## Status

- [x] **Fase 1: base, acesso e admin**
- [x] Fase 2: DNA do perfil
- [x] Fase 3: geração + trava anti-linguagem de IA
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

Admin = custom claim `admin: true` **ou** documento `admins/{uid}` criado no Console.

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

Projeto Firebase: `visionscontent-cba52`. Passo a passo completo para Mac, sem `gcloud`:
**[GUIA-DEPLOY.md](GUIA-DEPLOY.md)**.

Resumo: `firebase login`, apagar o Firestore antigo (`firebase firestore:delete --all-collections`),
`firebase deploy --only firestore:rules,functions`, criar o login no Console e marcar como admin
com um documento `admins/{uid}` (só o Console consegue criar), e desligar a inscrição aberta no Auth.

Alternativa por linha de comando (exige credencial do projeto): `functions/scripts/definirAdmin.js`
(custom claim) e `functions/scripts/limparProjeto.js` (apaga Auth + Firestore).

A chave da Anthropic (a partir da Fase 2) vai no Secret Manager:
`firebase functions:secrets:set ANTHROPIC_API_KEY`.

## Visual

Identidade da Visions: vermelho `#DD2A2A`, amarelo `#FFCF51` e azul `#2657A5` do logo, fundo marfim,
títulos em Fraunces (serifada) e texto em Inter. A faixa tricolor do logo aparece no topo dos cartões
e do cabeçalho. Logo em `assets/logo-visions.png`.

## Fase 2: DNA do perfil

- Onboarding em 6 passos na primeira entrada (negócio, tom, exemplos reais, palavras, tema, perfil de voz).
  O progresso fica salvo a cada passo.
- `extrairPerfilDeVoz` (callable): lê os exemplos e eixos do Firestore, gera o perfil com a IA,
  passa pela trava e salva em `dna/atual.tom.perfilDeVozExtraido`. O cliente edita depois.
- Tela "Meu perfil" para editar tudo depois.
- Sem DNA completo o botão de criar roteiro fica bloqueado; no servidor, `exigirDnaCompleto()`
  (em `functions/dna.js`) barra a geração da Fase 3.
- Trava anti-IA (`functions/ia/travaAntiIA.js`): validação com acentos/maiúsculas normalizados,
  heurísticas, palavras proibidas do cliente, loop de até 2 reescritas, correção automática do
  travessão e registro em `logs/trava/registros`.

## Fase 3: geração

- Wizard da seção 8.1 (formato, pilar, estilo válido para formato + pilar, ângulo, tema com
  "Sugerir temas", framework pré-selecionado, formato visual, CTA e estilo de legenda, revisar).
- `sugerirTemas` e `gerarRoteiro` (callables). JSON estruturado por formato (`functions/ia/esquemas.js`),
  conferência de contagens com 1 nova tentativa, trava com até 2 reescritas, regra de 90s
  (reels/série de P1 e P2: refaz pedindo corte para 70s; se continuar longo, salva com aviso).
- Reels, série, carrossel e post único saem com 5 ganchos e 3 ângulos para testar.
- Série: gera a parte 1; a parte N só sai depois da N-1 ("Gerar parte N" na tela do roteiro).
- Contexto de aprendizado: formato vencedor (admin), últimos diagnósticos e melhores posts
  (entram de verdade quando a Fase 5 começar a gravar métricas), últimos 10 ganchos.
- Tela do roteiro: fala, "mostrar" e "texto na tela" em cores diferentes, trechos com cara de IA
  sublinhados, copiar roteiro/legenda/gancho.

## Estratégia, produtos e foco do mês

- **Estratégia** (`clientes/{uid}/estrategia/atual`, só o admin escreve): plano de ação colado,
  branding (posicionamento, promessa, personalidade, valores, o que não faz), editorias e formatos
  prioritários. "Organizar com IA" (`adminExtrairEstrategia`) preenche os campos a partir do plano
  para o admin revisar. O cliente vê como lembrete na tela inicial.
- **Produtos** (`dna/atual.produtos`): passo do onboarding e "Meu perfil"; o admin também edita.
  Pelo menos 1 produto é obrigatório para gerar.
- **Foco do mês** (`clientes/{uid}/focos/AAAA-MM`): produto em destaque, objetivo e campanha ativa
  com mecânica, regras, datas, como participar e CTA. Não bloqueia: sem foco a tela inicial lembra.
  Vem pré-preenchido com o mês anterior. Campanha passada da data de fim sai dos roteiros sozinha.
- **Objetivo do perfil** (no foco do mês): crescer o perfil (P1 60% · P2 15% · P3 25%), aumentar a
  autoridade (30 · 20 · 50) ou vender com o perfil (25 · 50 · 25). O admin ajusta as porcentagens por
  cliente (`clientes/{uid}.mixPersonalizado`). A tela inicial mostra a mistura do mês (meta x feito) e
  o passo do pilar sugere o pilar que mais está faltando.
- No prompt, a parte fixa do cliente (perfil, voz, produtos, estratégia, plano) vai em cache entre
  gerações; o foco do mês e as escolhas do conteúdo vão na parte variável.

## Rodar local e testar

```bash
cd functions && npm test
```
```bash
cd testes && npm install && npm test
```

`functions/.env.local` liga a IA simulada (`IA_FAKE=1`) só nos emuladores.

O teste sobe os emuladores (Auth, Firestore, Functions) e verifica o aceite da Fase 1: cliente bloqueado
não loga, não lê nem escreve nada e não chama functions, mesmo com a sessão aberta antes do bloqueio;
desbloqueio devolve os dados intactos; vencimento passado bloqueia na primeira chamada.

Para usar a interface local: `firebase emulators:start` e sirva o `index.html` em `localhost`
(ex.: `npx serve .`). Em `localhost` o app se conecta sozinho aos emuladores.
