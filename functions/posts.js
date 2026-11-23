// Fase 5: marcar como postado, salvar métricas e diagnosticar.
const { HttpsError } = require('firebase-functions/v2/https');
const { db, Timestamp, FieldValue } = require('./lib/firebase');
const { callableCliente } = require('./lib/middleware');
const { mesReferencia } = require('./lib/tempo');
const { gerarJSON, registrarRespostaFalsa, ANTHROPIC_API_KEY } = require('./ia/cliente');
const trava = require('./ia/travaAntiIA');
const cat = require('./ia/catalogos');
const seed = require('./config/seedPadrao');
const { ganchoDe } = require('./roteiros');
const R = require('./diagnostico/regras');

const HORA = 3600 * 1000;

// ---------- marcarPostado ----------

function lembretesPara(formato, postadoEm) {
  const t = postadoEm.getTime();
  return R.ehStory(formato) ? [t + 20 * HORA] : [t + 48 * HORA, t + 7 * 24 * HORA];
}

exports.marcarPostado = callableCliente(async ({ data }, { uid }) => {
  const id = typeof data?.roteiroId === 'string' ? data.roteiroId : '';
  const ref = db.doc(`clientes/${uid}/roteiros/${id}`);
  const snap = id ? await ref.get() : null;
  if (!snap?.exists) throw new HttpsError('not-found', 'Não encontrei esse roteiro.');
  const r = snap.data();
  if (!['rascunho', 'pronto'].includes(r.status)) throw new HttpsError('failed-precondition', 'Esse roteiro já foi marcado como postado.');

  let postadoEm = new Date();
  if (data.postadoEm) {
    const d = new Date(data.postadoEm);
    if (Number.isNaN(d.getTime())) throw new HttpsError('invalid-argument', 'Data da postagem inválida.');
    if (d.getTime() > Date.now() + HORA) throw new HttpsError('invalid-argument', 'A data da postagem está no futuro. Marque como postado depois de publicar.');
    if (d.getTime() < Date.now() - 60 * 24 * HORA) throw new HttpsError('invalid-argument', 'Essa data é antiga demais (mais de 60 dias).');
    postadoEm = d;
  }
  const linkPost = typeof data.linkPost === 'string' ? data.linkPost.trim().slice(0, 500) : '';
  if (linkPost && !/^https?:\/\/(www\.)?instagram\.com\//i.test(linkPost)) {
    throw new HttpsError('invalid-argument', 'Cole o link do post do Instagram (começa com https://www.instagram.com/) ou deixe em branco.');
  }
  const ganchos = r.conteudo?.ganchos || [];
  const testados = Array.isArray(data.ganchosTestados)
    ? [...new Set(data.ganchosTestados.map(Number))].filter((x) => ganchos.some((g) => g.n === x)).sort()
    : [];

  const postRef = db.collection(`clientes/${uid}/posts`).doc();
  const horarios = lembretesPara(r.formato, postadoEm);
  const lote = db.batch();
  lote.set(postRef, {
    roteiroId: id,
    formato: r.formato, pilar: r.pilar, estilo: r.estilo, angulo: r.angulo, framework: r.framework,
    formatoVisual: r.formatoVisual || null, tema: r.tema, editoria: r.editoria || null,
    gancho: ganchoDe(r),
    ganchosTestados: testados.map((nG) => { const g = ganchos.find((x) => x.n === nG); return { n: g.n, tipo: g.tipo, texto: g.texto }; }),
    totalFrames: (r.conteudo?.frames || []).length || null,
    linkPost,
    postadoEm: Timestamp.fromDate(postadoEm),
    mes: mesReferencia(postadoEm),
    lembretes: horarios.map((t) => ({ em: Timestamp.fromMillis(t), enviado: false })),
    metricas: null,
    metricasPreenchidasEm: null,
    diagnostico: null,
    criadoEm: FieldValue.serverTimestamp(),
  });
  // Fila de lembretes (lida pela rotina de hora em hora da Fase 6).
  horarios.forEach((t, i) => lote.set(db.collection('lembretes').doc(`${postRef.id}_${i}`), { uid, postId: postRef.id, indice: i, em: Timestamp.fromMillis(t), postadoEm: Timestamp.fromDate(postadoEm) }));
  lote.update(ref, { status: 'postado', postId: postRef.id, atualizadoEm: FieldValue.serverTimestamp() });
  await lote.commit();
  return { postId: postRef.id };
});

// ---------- salvarMetricas ----------

const CAMPOS = {
  video: ['alcance', 'visualizacoes', 'retencao3s', 'tempoMedioSeg', 'duracaoSeg', 'curtidas', 'comentarios', 'compartilhamentos', 'salvamentos', 'seguidoresGanhos', 'mensagens', 'segundoQueda'],
  estatico: ['alcance', 'curtidas', 'comentarios', 'compartilhamentos', 'salvamentos', 'seguidoresGanhos', 'visitasPerfil', 'mensagens'],
  frame: ['alcance', 'avancos', 'saidas', 'respostas', 'toquesLink', 'interacoes'],
  p2: ['leads', 'vendas'],
};
const OBRIGATORIOS = { video: ['alcance', 'retencao3s', 'tempoMedioSeg', 'duracaoSeg'], estatico: ['alcance'], frame: ['alcance'] };

function numero(v, campo, { max = 1e9, opcional = true } = {}) {
  if (v === null || v === undefined || v === '') {
    if (opcional) return null;
    throw new HttpsError('invalid-argument', `Preencha ${campo}.`);
  }
  const x = Number(v);
  if (!Number.isFinite(x) || x < 0 || x > max) throw new HttpsError('invalid-argument', `O valor de ${campo} não parece certo. Use só números.`);
  return x;
}

function validarMetricas(post, m) {
  if (!m || typeof m !== 'object') throw new HttpsError('invalid-argument', 'Preencha as métricas.');
  const saida = {};
  if (R.ehStory(post.formato)) {
    const frames = Array.isArray(m.frames) ? m.frames.slice(0, 10) : [];
    if (!frames.length) throw new HttpsError('invalid-argument', 'Preencha o alcance de pelo menos 1 frame.');
    saida.frames = frames.map((f, i) => Object.fromEntries(CAMPOS.frame.map((c) => [c, numero(f?.[c], `${c} do frame ${i + 1}`, { opcional: !OBRIGATORIOS.frame.includes(c) })])));
    saida.alcance = saida.frames[0].alcance;
    saida.mensagens = numero(m.mensagens, 'mensagens');
  } else {
    const tipo = R.ehVideo(post.formato) ? 'video' : 'estatico';
    for (const c of CAMPOS[tipo]) {
      saida[c] = numero(m[c], c, { max: c === 'retencao3s' ? 100 : 1e9, opcional: !OBRIGATORIOS[tipo].includes(c) });
    }
    if (tipo === 'video' && post.ganchosTestados?.length >= 2) {
      const vs = Array.isArray(m.variantes) ? m.variantes : [];
      saida.variantes = post.ganchosTestados.map((g) => {
        const v = vs.find((x) => Number(x?.n) === g.n) || {};
        return { n: g.n, visualizacoes: numero(v.visualizacoes, `visualizações do gancho ${g.n}`), retencao3s: numero(v.retencao3s, `retenção do gancho ${g.n}`, { max: 100 }) };
      });
    }
  }
  if (post.pilar === 'P2') for (const c of CAMPOS.p2) saida[c] = numero(m[c], c);
  return saida;
}

const SYSTEM_EXPLICACAO = `Você explica para a dona de um perfil de Instagram o resultado de um post, em português do Brasil, com linguagem simples e direta, como uma consultora da Visions Marketing falando com a cliente. Responda só com o JSON pedido:
- explicacao: no máximo 5 frases. Diga o que aconteceu com o post e por quê, usando só o que os números e os achados mostram. Se os números não explicam uma causa, não invente.
- ajustesProximo: exatamente 3 ações concretas para o próximo post, cada uma em uma frase, aplicável na hora (ex.: "Troque só o gancho e mantenha o resto"). Respeite a regra de mudar 1 coisa por vez.
Não use travessão, não use contraste do tipo "não é X, é Y", não use as palavras "jornada", "é importante", "é essencial", "vale ressaltar". Não use jargão em inglês sem explicar.`;

const ESQUEMA_EXPLICACAO = { type: 'object', properties: { explicacao: { type: 'string' }, ajustesProximo: { type: 'array', items: { type: 'string' } } }, required: ['explicacao', 'ajustesProximo'], additionalProperties: false };

const pct = (x) => (x === null || x === undefined ? null : `${(x * 100).toFixed(1)}%`);

async function explicarComIA({ post, roteiro, metricas, taxas, referencia, achados, padroes }) {
  const resumo = {
    formato: cat.FORMATOS[post.formato], pilar: `${post.pilar} (${cat.PILARES[post.pilar].objetivo}, KPI ${cat.PILARES[post.pilar].kpi})`,
    tema: post.tema, gancho: post.gancho, cta: cat.CTAS[roteiro?.cta] || roteiro?.cta, duracaoRoteiroSeg: roteiro?.duracaoEstimadaSeg ?? null,
    metricas,
    taxas: Object.fromEntries(Object.entries(taxas).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, k === 'alcance' || k === 'duracaoSeg' || k === 'interacoes' ? v : pct(v)])),
    referencia: { origem: referencia.comparadoCom, valores: Object.fromEntries(Object.entries(referencia.ref).map(([k, v]) => [k, k === 'alcance' ? v : pct(v)])) },
    achados: achados.map((a) => `[${a.severidade}] ${a.mensagem}`),
  };
  const mensagens = [{ role: 'user', content: `Dados do post:\n${JSON.stringify(resumo, null, 2)}\n\nExplique o resultado e dê os 3 ajustes.` }];
  const validar = (x) => (Array.isArray(x?.ajustesProximo) && x.ajustesProximo.length === 3 && x.explicacao?.trim() ? [] : ['precisa de explicacao e exatamente 3 ajustesProximo']);
  const primeiro = await gerarJSON({ chave: 'diagnostico', system: SYSTEM_EXPLICACAO, mensagens, esquema: ESQUEMA_EXPLICACAO, validar, maxTokens: 6000, effort: 'low' });
  return trava.aplicarTrava(primeiro, padroes, (atual, violacoes) =>
    gerarJSON({
      chave: 'diagnosticoReescrita', system: SYSTEM_EXPLICACAO,
      mensagens: [...mensagens, { role: 'assistant', content: JSON.stringify(atual) }, { role: 'user', content: `${trava.instrucaoReescrita(violacoes)}\n\nDevolva o JSON completo.` }],
      esquema: ESQUEMA_EXPLICACAO, validar, maxTokens: 6000, effort: 'low',
    })
  );
}

exports.salvarMetricas = callableCliente(async ({ data }, { uid }) => {
  const postId = typeof data?.postId === 'string' ? data.postId : '';
  const ref = db.doc(`clientes/${uid}/posts/${postId}`);
  const snap = postId ? await ref.get() : null;
  if (!snap?.exists) throw new HttpsError('not-found', 'Não encontrei esse post.');
  const post = snap.data();
  const metricas = validarMetricas(post, data.metricas);
  const taxas = R.calcularTaxas(post.formato, metricas);

  const [histSnap, benchSnap, roteiroSnap, dnaSnap] = await Promise.all([
    db.collection(`clientes/${uid}/posts`).orderBy('metricasPreenchidasEm', 'desc').limit(30).get(),
    db.doc('config/benchmarks').get(),
    db.doc(`clientes/${uid}/roteiros/${post.roteiroId}`).get(),
    db.doc(`clientes/${uid}/dna/atual`).get(),
  ]);
  const historico = histSnap.docs.filter((d) => d.id !== postId).map((d) => d.data());
  const referencia = R.montarReferencia(post.formato, historico, benchSnap.exists ? benchSnap.data() : seed.benchmarks);
  const anterior = historico.find((p) => p.tema && p.tema === post.tema) || null;
  const roteiro = roteiroSnap.exists ? roteiroSnap.data() : null;
  const { achados, funcionou, kpi } = R.diagnosticar({ post: { ...post, metricas }, taxas, referencia, anterior, roteiroFrames: roteiro?.conteudo?.frames || [] });
  const venc = R.ehVideo(post.formato) ? R.ganchoVencedor(metricas.variantes || []) : null;

  let explicacao = '';
  let ajustesProximo = [];
  let pendentes = [];
  try {
    const padroes = await trava.carregarPadroes(db, dnaSnap.exists ? dnaSnap.data().palavrasProibidas : []);
    const r = await explicarComIA({ post, roteiro, metricas, taxas, referencia, achados, padroes });
    await trava.registrarLogs(db, { uid, refId: post.roteiroId, origem: 'diagnostico', historico: r.historico });
    explicacao = r.conteudo.explicacao;
    ajustesProximo = r.conteudo.ajustesProximo;
    pendentes = r.trava.pendentes;
  } catch (e) {
    // Sem IA, o diagnóstico sai só com as regras (nada se perde).
    console.error('diagnóstico: explicação da IA falhou', e.message);
    ajustesProximo = achados.filter((a) => a.severidade !== 'ok').map((a) => a.mensagem).slice(0, 3);
  }

  const agora = FieldValue.serverTimestamp();
  const lote = db.batch();
  lote.update(ref, {
    metricas,
    taxas,
    kpiValor: kpi.valor ?? null,
    metricasPreenchidasEm: agora,
    diagnostico: {
      achados, explicacao, ajustesProximo, comparadoCom: referencia.comparadoCom, funcionou,
      ganchoVencedor: venc ? { n: venc.n, texto: post.ganchosTestados.find((g) => g.n === venc.n)?.texto || '' } : null,
      pendentes, geradoEm: Timestamp.now(),
    },
  });
  if (roteiroSnap.exists) lote.update(roteiroSnap.ref, { status: 'medido', atualizadoEm: agora });
  lote.set(db.collection(`clientes/${uid}/notificacoes`).doc(), {
    tipo: 'diagnostico_pronto', postId, titulo: 'Diagnóstico pronto',
    texto: `O resultado de "${post.tema}" está pronto, com 3 ajustes para o próximo post.`, lida: false, criadoEm: agora,
  });
  await lote.commit();
  // Métrica preenchida: os lembretes pendentes desse post não precisam mais sair.
  const fila = await db.collection('lembretes').where('postId', '==', postId).get();
  if (!fila.empty) { const b = db.batch(); fila.docs.forEach((d) => b.delete(d.ref)); await b.commit(); }
  return { ok: true };
}, { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 180, memory: '512MiB' });

registrarRespostaFalsa('diagnostico', () => ({
  explicacao: 'O post chegou em bastante gente nova, mas pouca gente ficou depois dos 3 primeiros segundos — o gancho não segurou.',
  ajustesProximo: ['Troque só o gancho e mantenha o resto do roteiro.', 'Abra com uma cena específica do seu dia.', 'Teste 3 ganchos como Reels de teste antes de postar para todo mundo.'],
}));
registrarRespostaFalsa('diagnosticoReescrita', ({ mensagens }) => mensagens[mensagens.length - 2].content.replace(' — o gancho', ': o gancho'));

exports.validarMetricas = validarMetricas;
exports.lembretesPara = lembretesPara;
