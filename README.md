# Plataforma de Roteiros Visions

Plataforma web em que clientes da Visions Marketing geram roteiros para Instagram com a voz de cada perfil.
Frontend em um único `index.html` (React + Babel via CDN, no Netlify) e backend no Firebase
(Auth, Firestore, Cloud Functions v2 em Node 22, Scheduler e FCM).

## Status

- [x] **Fase 1: base, acesso e admin**
- [x] Fase 2: DNA do perfil
- [x] Fase 3: geração + trava anti-linguagem de IA
- [x] Fase 4: editor
- [x] Fase 5: postado, métricas e diagnóstico
- [x] Fase 6: lembretes (PWA + push)
- [x] Fase 7: campanhas
- [x] Fase 8: admin avançado

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

## Fase 4: editor

- Botão "Editar": todos os textos viram caixas editáveis; salvar cria uma versão "Você editou".
  O que o cliente escreve não passa pela trava (é a voz dela).
- "Regerar" em cada bloco, slide, frame, arte, gancho e legenda, com pedido opcional
  ("mais curto", "mais engraçado"). `regerarBloco` reescreve só aquele item, mantém o resto,
  passa pela trava e mantém o gancho 1 igual à abertura do roteiro.
- Histórico das últimas 10 versões com "Restaurar" (a versão escolhida vira a mais recente).
- "Pronto para gravar" (status `pronto`), excluir roteiro, copiar roteiro/legenda/gancho.
- Biblioteca "Meus roteiros": busca pelo tema e filtro por formato, pilar e status, 50 por vez.

## Fase 5: postado, métricas e diagnóstico

- "Marcar como postado" (`marcarPostado`): link, data e quais ganchos foram ao ar como Reels de teste.
  Cria o post, agenda lembretes (stories em 20h; o resto em 48h e 7 dias, fila `lembretes/`) e
  muda o roteiro para `postado`.
- Formulário de métricas por formato com "?" explicando onde achar cada número no Instagram;
  stories por frame; P2 com leads e vendas; Reels de teste com visualizações e retenção por gancho.
- `salvarMetricas`: taxas (11.2), referência (mediana dos últimos 10 do formato com 3+ medidos, senão
  `config/benchmarks`), regras de `functions/diagnostico/regras.js` (11.4 + gancho vencedor, segundo da
  queda e "1 variável por vez") e explicação da IA com 3 ajustes, passando pela trava. Se a IA falhar,
  o diagnóstico sai só com as regras. O diagnóstico sempre diz contra o que comparou.
- Os diagnósticos e os melhores posts entram no prompt das próximas gerações.
- Tela inicial: posts esperando resultado, melhor post do mês por pilar e últimos diagnósticos.
- A mistura de pilares do mês passa a contar os posts **publicados** (não os roteiros criados).

## Fase 6: lembretes

- PWA: `manifest.json`, ícones em `assets/`, `sw.js` (cache do app + push; um único service worker
  na raiz) e `firebase-messaging-sw.js` (aponta para o `sw.js`).
- Cartão "Instale o app e ative os lembretes": Android instala com 1 toque; iPhone mostra o passo a
  passo (Compartilhar > Adicionar à Tela de Início), porque no iOS o push só funciona com o app instalado.
- Push pelo FCM: o token de cada aparelho vai para `clientes/{uid}.fcmTokens`. Precisa da chave pública
  de Web Push em `VAPID_KEY` no `index.html` (Console > Cloud Messaging > Certificados push da Web).
- `enviarLembretes` (de hora em hora): lê a fila `lembretes/`, cria a notificação no app, manda o push,
  remove tokens inválidos e marca o lembrete como enviado. Cliente bloqueado ou post já medido: sai da fila.
- Sino com contador e central de notificações; tocar abre o post. O push abre o app direto no post.

## Fase 7: campanhas

- "Nova campanha": nome, objetivo, oferta, mecânica, datas, quantidade de posts e formatos. Vem
  preenchida com a campanha do foco do mês ("Planejar cronograma da campanha").
- `gerarCronogramaCampanha`: o código monta o esqueleto (aquecimento ~40% com P1+P3, conversão ~40% com
  P2, última chamada ~20% com P2 colada na data-limite; datas espalhadas; nunca o mesmo formato 3 vezes
  seguidas quando há mais de 1; ângulos alternados; estilos válidos) e a IA escreve tema e "por quê"
  de cada post, passando pela trava. Conta 1 geração.
- Tela da campanha: lista por fase (com troca de data) e calendário do mês (arrastar no computador;
  no celular, tocar no post e depois no dia).
- "Criar roteiro" abre a criação com tudo preenchido e o contexto da campanha (objetivo, oferta,
  mecânica, fase e por quê) no prompt. Status do post acompanha: ideia, roteiro, postado, medido.

## Fase 8: admin avançado

Abas no painel admin: Clientes, Trava, Relatório, Referências e Uso.
- **Trava**: editor da lista base (ativar/desligar, id, tipo, valor, descrição) com teste ao vivo
  sobre um texto de exemplo, rodando a trava real do servidor (`adminTestarTrava`) com a lista ainda
  não salva. `adminAtualizarTrava` valida regex, ids e heurísticas antes de salvar.
- **Relatório**: padrões mais barrados (7, 30 ou 90 dias), quantos a IA tentou na primeira escrita,
  quanto foi resolvido, exemplos e contagem por cliente (`logs/trava/registros`).
- **Referências**: edição de `config/benchmarks` em % (`adminAtualizarBenchmarks`).
- **Uso**: gerações por cliente nos últimos 6 meses (`clientes/{uid}.geracoesPorMes`), com destaque
  para quem bateu o limite.

## Tutorial "Como usar"

Tour de 9 telas que abre sozinho na primeira vez que o cliente chega à tela inicial depois do DNA
(foco do mês, criar roteiro, 5 ganchos, editar e regerar, marcar como postado, métricas e diagnóstico,
campanhas, app no celular). Fica disponível no botão "Como usar". O "já visto" é guardado no aparelho.

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
