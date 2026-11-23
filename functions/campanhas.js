// Fase 7: campanhas e cronograma (seção 12).
const { HttpsError } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('./lib/firebase');
const { callableCliente, registrarGeracao } = require('./lib/middleware');
const { gerarJSON, registrarRespostaFalsa, ANTHROPIC_API_KEY } = require('./ia/cliente');
const trava = require('./ia/travaAntiIA');
const cat = require('./ia/catalogos');
const { exigirDnaCompleto } = require('./dna');
const { carregarEstrategiaEFoco } = require('./estrategia');

const FASES = [
  { id: 'aquecimento', nome: 'Aquecimento', parte: 0.4, pilares: ['P1', 'P3'], descricao: 'Gerar demanda e conversa sobre o tema.' },
  { id: 'conversao', nome: 'Conversão', parte: 0.4, pilares: ['P2'], descricao: 'Prova social, processo e transformação.' },
  { id: 'ultima_chamada', nome: 'Última chamada', parte: 0.2, pilares: ['P2'], descricao: 'Venda com prazo, perto da data-limite.' },
];
// Estilos preferidos por fase (o primeiro válido para o formato + pilar é usado, em rodízio).
const ESTILOS_FASE = {
  aquecimento: { P1: ['analise', 'cultura_pop', 'pauta_quente'], P3: ['opiniao', 'desejo', 'noticia', 'analise', 'bastidor', 'interacao', 'historia'] },
  conversao: { P2: ['prova_social', 'tecnico', 'transformacao', 'historia', 'bastidor', 'interacao'] },
  ultima_chamada: { P2: ['prova_social', 'transformacao', 'historia', 'tecnico', 'interacao'] },
};
const ANGULOS_ORDEM = ['erro_comum', 'maior_desejo', 'historia_pessoal', 'mito_industria', 'duvida_comum', 'passo_a_passo'];
const DIA = 24 * 3600 * 1000;

const isoParaData = (iso) => new Date(`${iso}T12:00:00-03:00`);
const dataParaIso = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

// Quantos posts em cada fase (soma = total, cada fase com pelo menos 1 quando dá).
function dividirFases(total) {
  const ultima = Math.max(1, Math.round(total * 0.2));
  const aquec = Math.max(1, Math.round(total * 0.4));
  const conv = Math.max(total - ultima - aquec, total >= 3 ? 1 : 0);
  const ajuste = total - (ultima + aquec + conv);
  return { aquecimento: aquec + ajuste, conversao: conv, ultima_chamada: ultima };
}

// Datas espalhadas entre início e limite (inclusive), em ordem.
function distribuirDatas(inicio, limite, total) {
  const a = isoParaData(inicio).getTime();
  const b = isoParaData(limite).getTime();
  const dias = Math.round((b - a) / DIA);
  return Array.from({ length: total }, (_, i) => dataParaIso(new Date(a + Math.round(total === 1 ? dias : (i * dias) / (total - 1)) * DIA)));
}

// Escolhe o formato evitando o mesmo mais de 2 vezes seguidas (quando há mais de 1 permitido).
function escolherFormato(permitidos, anteriores, preferidos, i) {
  const ordem = [...preferidos.filter((f) => permitidos.includes(f)), ...permitidos.filter((f) => !preferidos.includes(f))];
  const rodada = ordem.slice(i % ordem.length).concat(ordem.slice(0, i % ordem.length));
  const n = anteriores.length;
  return rodada.find((f) => !(n >= 2 && anteriores[n - 1] === f && anteriores[n - 2] === f)) || rodada[0];
}

// Esqueleto determinístico do cronograma: datas, fases, pilares, formatos, estilos e ângulos.
function montarEsqueleto({ dataInicio, dataLimite, quantidadePosts, formatosPermitidos }) {
  const qtd = dividirFases(quantidadePosts);
  const datas = distribuirDatas(dataInicio, dataLimite, quantidadePosts);
  const posts = [];
  const fases = [];
  let k = 0;
  const contadorEstilo = {};
  for (const f of FASES) {
    const n = qtd[f.id];
    if (!n) continue;
    const ini = k;
    for (let j = 0; j < n; j++, k++) {
      const pilar = f.pilares[j % f.pilares.length];
      const preferidos = f.id === 'aquecimento' ? ['reels', 'carrossel', 'serie'] : f.id === 'conversao' ? ['reels', 'carrossel', 'sequencia_stories'] : ['sequencia_stories', 'reels', 'post_unico'];
      const formato = escolherFormato(formatosPermitidos, posts.map((p) => p.formato), preferidos, j);
      const validos = cat.estilosValidos(formato, pilar);
      const prefs = ESTILOS_FASE[f.id][pilar].filter((e) => validos.includes(e));
      const chave = `${f.id}-${pilar}`;
      contadorEstilo[chave] = (contadorEstilo[chave] || 0) + 1;
      const lista = prefs.length ? prefs : validos;
      const estilo = lista[(contadorEstilo[chave] - 1) % lista.length];
      let angulo = ANGULOS_ORDEM[k % ANGULOS_ORDEM.length];
      if (posts.length && posts[posts.length - 1].angulo === angulo) angulo = ANGULOS_ORDEM[(k + 1) % ANGULOS_ORDEM.length];
      posts.push({ ordem: k + 1, data: datas[k], fase: f.id, formato, pilar, estilo, angulo, temaProposto: '', porQue: '', roteiroId: null, status: 'ideia' });
    }
    fases.push({ id: f.id, nome: f.nome, inicio: datas[ini], fim: datas[k - 1], pilares: f.pilares });
  }
  return { fases, posts };
}

const SYSTEM_CRONOGRAMA = `Você planeja os temas de uma campanha de conteúdo para Instagram de uma pessoa real. O cronograma (datas, fases, formatos, pilares, estilos e ângulos) já está definido: você escreve só, para cada post, "temaProposto" (uma linha, específico, do jeito que a pessoa falaria) e "porQue" (uma frase explicando a posição desse post no funil da campanha). Responda só com o JSON pedido, um item por post, na mesma ordem.

Regras: 1 assunto por post. Os temas contam uma progressão: o aquecimento cria vontade e conversa sobre o tema da campanha sem vender; a conversão mostra prova, processo e transformação ligados à oferta; a última chamada usa o prazo e a mecânica da campanha. Não repita tema. Não invente números, depoimentos ou regras da campanha. Não use travessão, nem contraste do tipo "não é X, é Y", nem as palavras "jornada", "é importante", "é essencial".`;

const ESQUEMA = { type: 'object', properties: { posts: { type: 'array', items: { type: 'object', properties: { ordem: { type: 'integer' }, temaProposto: { type: 'string' }, porQue: { type: 'string' } }, required: ['ordem', 'temaProposto', 'porQue'], additionalProperties: false } } }, required: ['posts'], additionalProperties: false };

function texto(v, nome, max, obrigatorio = false) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (obrigatorio && !s) throw new HttpsError('invalid-argument', `Preencha ${nome}.`);
  if (s.length > max) throw new HttpsError('invalid-argument', `${nome} passou de ${max} caracteres.`);
  return s;
}

function validarEntrada(d) {
  const nome = texto(d.nome, 'o nome da campanha', 120, true);
  const objetivo = texto(d.objetivo, 'o objetivo', 600, true);
  const oferta = texto(d.oferta, 'a oferta', 600, true);
  const mecanica = texto(d.mecanica, 'a mecânica', 2000);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(d.dataInicio || '') || !re.test(d.dataLimite || '')) throw new HttpsError('invalid-argument', 'Escolha a data de início e a data-limite.');
  if (d.dataLimite < d.dataInicio) throw new HttpsError('invalid-argument', 'A data-limite está antes do início.');
  const dias = Math.round((isoParaData(d.dataLimite) - isoParaData(d.dataInicio)) / DIA);
  if (dias > 120) throw new HttpsError('invalid-argument', 'A campanha pode durar no máximo 120 dias.');
  const quantidadePosts = Number(d.quantidadePosts);
  if (!Number.isInteger(quantidadePosts) || quantidadePosts < 3 || quantidadePosts > 40) throw new HttpsError('invalid-argument', 'A campanha precisa ter entre 3 e 40 posts.');
  const formatosPermitidos = Array.isArray(d.formatosPermitidos) ? [...new Set(d.formatosPermitidos)].filter((f) => f in cat.FORMATOS) : [];
  if (!formatosPermitidos.length) throw new HttpsError('invalid-argument', 'Escolha pelo menos 1 formato.');
  return { nome, objetivo, oferta, mecanica, dataInicio: d.dataInicio, dataLimite: d.dataLimite, quantidadePosts, formatosPermitidos };
}

exports.gerarCronogramaCampanha = callableCliente(async ({ data }, { uid }) => {
  const entrada = validarEntrada(data || {});
  const dna = await exigirDnaCompleto(uid);
  const [padroes, ctx] = await Promise.all([trava.carregarPadroes(db, dna.palavrasProibidas), carregarEstrategiaEFoco(uid)]);
  const { fases, posts } = montarEsqueleto(entrada);

  const contexto = {
    pessoa: { oQueFaz: dna.negocio?.oQueFaz, paraQuem: dna.negocio?.paraQuem, temaPrincipal: dna.temaPrincipal, subtemas: dna.subtemas, produtos: (dna.produtos || []).map((p) => p.nome) },
    editorias: (ctx.estrategia?.editorias || []).map((e) => e.nome),
    campanha: { nome: entrada.nome, objetivo: entrada.objetivo, oferta: entrada.oferta, mecanica: entrada.mecanica, inicio: entrada.dataInicio, dataLimite: entrada.dataLimite },
    posts: posts.map((p) => ({ ordem: p.ordem, data: p.data, fase: FASES.find((f) => f.id === p.fase).nome, formato: cat.FORMATOS[p.formato], pilar: p.pilar, estilo: cat.ESTILOS[p.estilo], angulo: cat.ANGULOS[p.angulo] })),
  };
  const mensagens = [{ role: 'user', content: `${JSON.stringify(contexto, null, 2)}\n\nEscreva temaProposto e porQue para cada post.` }];
  const validar = (r) => (Array.isArray(r?.posts) && r.posts.length === posts.length ? [] : [`precisa de exatamente ${posts.length} posts, na mesma ordem`]);
  const primeiro = await gerarJSON({ chave: 'cronograma', system: SYSTEM_CRONOGRAMA, mensagens, esquema: ESQUEMA, validar, maxTokens: 12000 });
  const r = await trava.aplicarTrava(primeiro, padroes, (atual, violacoes) =>
    gerarJSON({ chave: 'cronogramaReescrita', system: SYSTEM_CRONOGRAMA, mensagens: [...mensagens, { role: 'assistant', content: JSON.stringify(atual) }, { role: 'user', content: `${trava.instrucaoReescrita(violacoes)}\n\nDevolva o JSON completo.` }], esquema: ESQUEMA, validar, maxTokens: 12000 })
  );
  const ref = db.collection(`clientes/${uid}/campanhas`).doc();
  await trava.registrarLogs(db, { uid, refId: ref.id, origem: 'cronograma', historico: r.historico });

  posts.forEach((p, i) => {
    p.temaProposto = r.conteudo.posts[i]?.temaProposto || '';
    p.porQue = r.conteudo.posts[i]?.porQue || '';
  });
  await ref.set({ ...entrada, fases, posts, pendentes: r.trava.pendentes, criadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp() });
  await registrarGeracao(uid);
  return { id: ref.id };
}, { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: '512MiB', consomeGeracao: true });

// Status do post na campanha acompanha o roteiro: ideia -> roteiro -> postado -> medido.
async function atualizarPostDaCampanha(uid, campanhaId, filtro, mudancas) {
  if (!campanhaId) return;
  const ref = db.doc(`clientes/${uid}/campanhas/${campanhaId}`);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return;
    const posts = s.data().posts.map((p) => (filtro(p) ? { ...p, ...mudancas } : p));
    tx.update(ref, { posts, atualizadoEm: FieldValue.serverTimestamp() });
  });
}

async function contextoDaCampanha(uid, campanhaId, ordem) {
  const s = await db.doc(`clientes/${uid}/campanhas/${campanhaId}`).get();
  if (!s.exists) throw new HttpsError('not-found', 'Não encontrei essa campanha.');
  const c = s.data();
  const post = c.posts.find((p) => p.ordem === Number(ordem));
  if (!post) throw new HttpsError('not-found', 'Esse post não está no cronograma.');
  if (post.roteiroId) throw new HttpsError('failed-precondition', 'Esse post da campanha já tem roteiro.');
  const fase = FASES.find((f) => f.id === post.fase);
  return {
    post,
    campanha: { nome: c.nome, objetivo: c.objetivo, oferta: c.oferta, mecanica: c.mecanica, fase: `${fase.nome} (${fase.descricao}) Post ${post.ordem} de ${c.posts.length}, em ${post.data.split('-').reverse().join('/')}${c.dataLimite ? `, data-limite ${c.dataLimite.split('-').reverse().join('/')}` : ''}. Por que este post: ${post.porQue}` },
  };
}

registrarRespostaFalsa('cronograma', ({ mensagens }) => {
  const ctx = JSON.parse(mensagens[0].content.split('\n\nEscreva')[0]);
  return { posts: ctx.posts.map((p, i) => ({ ordem: p.ordem, temaProposto: `Tema ${p.ordem}: ${p.fase} sobre ${ctx.campanha.nome}`, porQue: i === 0 ? 'Abre a conversa — sem vender ainda.' : `Post de ${p.fase.toLowerCase()} que prepara o próximo.` })) };
});
registrarRespostaFalsa('cronogramaReescrita', ({ mensagens }) => mensagens[mensagens.length - 2].content.replace(' — sem vender', ', sem vender'));

exports.montarEsqueleto = montarEsqueleto;
exports.dividirFases = dividirFases;
exports.atualizarPostDaCampanha = atualizarPostDaCampanha;
exports.contextoDaCampanha = contextoDaCampanha;
exports.FASES = FASES;
