// Fase 3: sugestão de temas e geração de roteiro (seção 8.2).
const { HttpsError } = require('firebase-functions/v2/https');
const { db, Timestamp, FieldValue } = require('./lib/firebase');
const { callableCliente, registrarGeracao } = require('./lib/middleware');
const { gerarJSON, ANTHROPIC_API_KEY } = require('./ia/cliente');
const { montarPromptRoteiro, SYSTEM_TEMAS } = require('./ia/prompts');
const { ESQUEMAS, temas: ESQUEMA_TEMAS, duracaoEstimadaSeg, validarConteudo } = require('./ia/esquemas');
const trava = require('./ia/travaAntiIA');
const cat = require('./ia/catalogos');
const { exigirDnaCompleto } = require('./dna');
const { carregarEstrategiaEFoco } = require('./estrategia');

const OPCOES_IA = { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: '512MiB' };
const MAX_VERSOES = 10;

// ---------- validação das escolhas ----------

function escolha(valor, lista, nome) {
  if (!(valor in lista)) throw new HttpsError('invalid-argument', `Escolha ${nome} de novo.`);
  return valor;
}

function validarEscolhasBase(data) {
  const editoria = typeof data.editoria === 'string' && data.editoria.trim() ? data.editoria.trim().slice(0, 80) : null;
  const formato = escolha(data.formato, cat.FORMATOS, 'o formato');
  const pilar = escolha(data.pilar, cat.PILARES, 'o pilar');
  const estilo = escolha(data.estilo, cat.ESTILOS, 'o estilo');
  if (!cat.estilosValidos(formato, pilar).includes(estilo)) {
    throw new HttpsError('invalid-argument', 'Esse estilo não combina com o formato e o pilar escolhidos. Escolha outro estilo.');
  }
  const angulo = escolha(data.angulo, cat.ANGULOS, 'o ângulo');
  return { formato, pilar, estilo, angulo, editoria };
}

function validarEscolhas(data) {
  const base = validarEscolhasBase(data);
  const tema = typeof data.tema === 'string' ? data.tema.trim() : '';
  if (tema.length < 3) throw new HttpsError('invalid-argument', 'Escreva o tema do conteúdo (ou toque em "Sugerir temas").');
  if (tema.length > 300) throw new HttpsError('invalid-argument', 'O tema ficou longo demais. Resuma em uma linha.');
  const framework = escolha(data.framework, cat.FRAMEWORKS, 'o framework');
  const temVisual = cat.FORMATOS_COM_VISUAL.includes(base.formato);
  const formatoVisual = temVisual ? escolha(data.formatoVisual, cat.FORMATOS_VISUAIS, 'o formato visual') : null;
  const cta = escolha(data.cta, cat.CTAS, 'o CTA');
  const ehStory = cat.FORMATOS_STORY.includes(base.formato);
  const estiloLegenda = ehStory ? null : escolha(data.estiloLegenda, cat.ESTILOS_LEGENDA, 'o estilo de legenda');
  const editoria = typeof data.editoria === 'string' && data.editoria.trim() ? data.editoria.trim().slice(0, 80) : null;
  return { ...base, tema, temaSugeridoPelaIA: data.temaSugeridoPelaIA === true, editoria, framework, formatoVisual, cta, estiloLegenda };
}

// ---------- contexto de aprendizado ----------

const KPI = {
  P1: (m) => (m.compartilhamentos || 0) / (m.alcance || 1),
  P2: (m) => ((m.mensagens || 0) + (m.leads || 0)) / (m.alcance || 1),
  P3: (m) => ((m.comentarios || 0) + (m.salvamentos || 0)) / (m.alcance || 1),
};

async function carregarAprendizados(uid, { formato, pilar }, cliente) {
  const vencedor = cliente.crescimento?.fase === 'vencedor_definido' ? cliente.crescimento.vencedor : null;
  let medidos = [];
  try {
    const snap = await db.collection(`clientes/${uid}/posts`).orderBy('metricasPreenchidasEm', 'desc').limit(30).get();
    medidos = snap.docs.map((d) => d.data());
  } catch (e) {
    console.warn('aprendizados: sem posts medidos ainda', e.message);
  }
  const diagnosticos = medidos
    .filter((p) => p.diagnostico && (p.formato === formato || p.pilar === pilar))
    .slice(0, 5)
    .map((p) => ({
      formato: p.formato,
      pilar: p.pilar,
      achados: (p.diagnostico.achados || []).filter((a) => a.severidade === 'alta').map((a) => a.mensagem),
      ajustes: p.diagnostico.ajustesProximo || [],
    }));
  const melhores = medidos
    .filter((p) => p.pilar === pilar && p.metricas?.alcance)
    .sort((a, b) => KPI[pilar](b.metricas) - KPI[pilar](a.metricas))
    .slice(0, 3)
    .map((p) => ({ tema: p.tema || '', angulo: p.angulo, gancho: p.gancho || '' }));
  return { vencedor, diagnosticos, melhores };
}

function ganchoDe(roteiro) {
  const c = roteiro.conteudo || {};
  return c.blocos?.find((b) => b.tipo === 'gancho')?.fala || c.slides?.[0]?.texto || c.arte?.headline || c.frames?.[0]?.conteudo || '';
}

async function carregarRecentes(uid) {
  const snap = await db.collection(`clientes/${uid}/roteiros`).orderBy('criadoEm', 'desc').limit(10).get();
  const roteiros = snap.docs.map((d) => d.data());
  return {
    ganchos: roteiros.map(ganchoDe).filter(Boolean).map((g) => g.slice(0, 160)),
    temas: roteiros.map((r) => r.tema).filter(Boolean),
  };
}

// ---------- geração com trava ----------

// Gera o conteúdo e passa pela trava. Não grava nada (usado também pelo teste com a API real).
async function gerarConteudo({ formato, prompt, padroes, extraUsuario = null, conteudoBase = null }) {
  const esquema = ESQUEMAS[formato];
  const validar = (c) => validarConteudo(formato, c);
  const primeiraMensagem = [{ role: 'user', content: prompt.user }];

  let conversaBase = primeiraMensagem;
  if (conteudoBase && extraUsuario) {
    // Refação (ex.: cortar duração) a partir de um conteúdo já gerado.
    conversaBase = [...primeiraMensagem, { role: 'assistant', content: JSON.stringify(conteudoBase) }, { role: 'user', content: extraUsuario }];
  }
  const conteudo = await gerarJSON({ chave: `roteiro:${formato}`, system: prompt.system, mensagens: conversaBase, esquema, validar });

  return trava.aplicarTrava(conteudo, padroes, (atual, violacoes) =>
    gerarJSON({
      chave: `roteiroReescrita:${formato}`,
      system: prompt.system,
      mensagens: [
        ...primeiraMensagem,
        { role: 'assistant', content: JSON.stringify(atual) },
        { role: 'user', content: `${trava.instrucaoReescrita(violacoes)}\n\nDevolva o JSON completo.` },
      ],
      esquema,
      validar,
    })
  );
}

// Regra de duração: reels/série de P1 ou P2 acima de 90s refaz pedindo corte; se continuar longo, aviso.
async function gerarComDuracao({ escolhas, prompt, padroes, aoGerar = async () => {} }) {
  let r = await gerarConteudo({ formato: escolhas.formato, prompt, padroes });
  await aoGerar(r);
  const avisos = [];
  const controlaDuracao = ['reels', 'serie'].includes(escolhas.formato) && ['P1', 'P2'].includes(escolhas.pilar);
  let duracao = duracaoEstimadaSeg(r.conteudo);
  if (controlaDuracao && duracao > cat.DURACAO_MAX_CRESCER_SEG) {
    const r2 = await gerarConteudo({
      formato: escolhas.formato, prompt, padroes, conteudoBase: r.conteudo,
      extraUsuario: `O vídeo ficou com cerca de ${duracao}s faladas. Corte para no máximo ${cat.DURACAO_ALVO_CORTE_SEG}s (cerca de ${cat.DURACAO_ALVO_CORTE_SEG * cat.PALAVRAS_POR_SEGUNDO} palavras faladas no total), mantendo o gancho, a big idea e o CTA. Devolva o JSON completo.`,
    });
    await aoGerar(r2);
    r = { ...r2, trava: { ...r2.trava, tentativas: r.trava.tentativas + r2.trava.tentativas, violacoesEncontradas: [...r.trava.violacoesEncontradas, ...r2.trava.violacoesEncontradas] } };
    duracao = duracaoEstimadaSeg(r.conteudo);
    if (duracao > cat.DURACAO_MAX_CRESCER_SEG) {
      avisos.push(escolhas.pilar === 'P2'
        ? 'Acima de 1min30 esse vídeo não roda bem como anúncio.'
        : 'Acima de 1min30 esse vídeo tende a alcançar menos gente nova. Para crescer a base, corte antes de gravar.');
    }
  }
  return { ...r, avisos };
}

// ---------- callables ----------

exports.sugerirTemas = callableCliente(async ({ data }, { uid, cliente }) => {
  const escolhas = validarEscolhasBase(data || {});
  const dna = await exigirDnaCompleto(uid);
  const [padroes, recentes, aprend, ctxEstr] = await Promise.all([
    trava.carregarPadroes(db, dna.palavrasProibidas),
    carregarRecentes(uid),
    carregarAprendizados(uid, escolhas, cliente),
    carregarEstrategiaEFoco(uid),
  ]);
  const system = SYSTEM_TEMAS(dna, escolhas, recentes.temas, aprend.melhores, ctxEstr.estrategia, ctxEstr.foco);
  const validar = (r) => (Array.isArray(r?.temas) && r.temas.length === 5 ? [] : ['precisa de exatamente 5 temas']);
  const mensagens = [{ role: 'user', content: 'Sugira os 5 temas.' }];
  const primeiro = await gerarJSON({ chave: 'temas', system, mensagens, esquema: ESQUEMA_TEMAS, validar, maxTokens: 6000 });
  const r = await trava.aplicarTrava(primeiro, padroes, (atual, violacoes) =>
    gerarJSON({
      chave: 'temasReescrita',
      system,
      mensagens: [...mensagens, { role: 'assistant', content: JSON.stringify(atual) }, { role: 'user', content: `${trava.instrucaoReescrita(violacoes)}\n\nDevolva o JSON completo.` }],
      esquema: ESQUEMA_TEMAS,
      validar,
      maxTokens: 6000,
    })
  );
  await trava.registrarLogs(db, { uid, refId: null, origem: 'temas', historico: r.historico });
  // Temas com cara de IA que sobraram não aparecem como sugestão.
  const ruins = new Set(r.trava.pendentes.map((p) => p.campo.split('.')[1]));
  return { temas: r.conteudo.temas.filter((_, i) => !ruins.has(String(i))) };
}, OPCOES_IA);

exports.gerarRoteiro = callableCliente(async ({ data }, { uid, cliente }) => {
  data = data || {};
  const dna = await exigirDnaCompleto(uid);

  // Série: a parte N só sai depois que a N-1 existir.
  let escolhas;
  let serieId = null;
  let parteSerie = null;
  let contextoSerie = null;
  let anterior = null;
  if (data.continuarSerie) {
    const partes = await db.collection(`clientes/${uid}/roteiros`).where('serieId', '==', String(data.continuarSerie)).get();
    const lista = partes.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.parteSerie - b.parteSerie);
    if (!lista.length) throw new HttpsError('not-found', 'Não encontrei essa série.');
    const primeira = lista[0];
    anterior = lista[lista.length - 1];
    const total = primeira.conteudo.totalPartes;
    if (anterior.parteSerie >= total) throw new HttpsError('failed-precondition', `Essa série já tem as ${total} partes.`);
    escolhas = {
      formato: 'serie', pilar: primeira.pilar, estilo: primeira.estilo, angulo: primeira.angulo, tema: primeira.tema,
      temaSugeridoPelaIA: primeira.temaSugeridoPelaIA, editoria: primeira.editoria || null, framework: primeira.framework, formatoVisual: primeira.formatoVisual,
      cta: anterior.parteSerie + 1 < total ? 'parte2' : (cat.ctaSugerido('reels', primeira.pilar, dna.negocio?.destinoVenda)),
      estiloLegenda: primeira.estiloLegenda,
    };
    serieId = primeira.serieId;
    parteSerie = anterior.parteSerie + 1;
    const ultima = parteSerie === total;
    contextoSerie = [
      `Série "${primeira.conteudo.nomeSerie}", ${total} partes. Agora escreva a parte ${parteSerie}.`,
      ...lista.map((p) => `Parte ${p.parteSerie}: ${p.conteudo.bigIdea}`),
      `Fim da parte ${anterior.parteSerie}: "${(anterior.conteudo.blocos || []).slice(-2).map((b) => b.fala).join(' ')}"`,
      'Comece retomando a parte anterior em uma frase.',
      ultima ? 'Esta é a última parte: feche a série e use o CTA de venda/ação.' : 'Termine puxando a próxima parte.',
      `Mantenha nomeSerie "${primeira.conteudo.nomeSerie}" e totalPartes ${total}.`,
    ].join('\n');
  } else {
    escolhas = validarEscolhas(data);
    if (escolhas.formato === 'serie') contextoSerie = 'Esta é a parte 1. Defina o nome da série e quantas partes ela terá. Termine puxando a parte 2.';
  }

  const [padroes, recentes, aprendizados, ctxEstr] = await Promise.all([
    trava.carregarPadroes(db, dna.palavrasProibidas),
    carregarRecentes(uid),
    carregarAprendizados(uid, escolhas, cliente),
    carregarEstrategiaEFoco(uid),
  ]);
  const prompt = montarPromptRoteiro({ dna, escolhas, padroes, aprendizados, ganchosRecentes: recentes.ganchos, campanha: null, serie: contextoSerie, estrategia: ctxEstr.estrategia, foco: ctxEstr.foco });

  const r = await gerarComDuracao({
    escolhas, prompt, padroes,
    aoGerar: (x) => trava.registrarLogs(db, { uid, refId: null, origem: 'roteiro', historico: x.historico }),
  });
  const avisos = r.avisos;

  const conteudo = r.conteudo;
  const legenda = conteudo.legenda || '';
  const ref = db.collection(`clientes/${uid}/roteiros`).doc();
  if (escolhas.formato === 'serie' && !serieId) {
    serieId = ref.id;
    parteSerie = 1;
  }
  const agora = Timestamp.now();
  await ref.set({
    ...escolhas,
    conteudo,
    legenda,
    duracaoEstimadaSeg: duracaoEstimadaSeg(conteudo),
    avisos,
    trava: r.trava,
    campanhaId: data.campanhaId || null,
    focoMes: ctxEstr.foco ? require('./lib/tempo').mesReferencia() : null,
    serieId,
    parteSerie,
    status: 'rascunho',
    versoes: [{ conteudo, legenda, editadoPor: 'ia', em: agora, pendentes: r.trava.pendentes }].slice(-MAX_VERSOES),
    criadoEm: FieldValue.serverTimestamp(),
    atualizadoEm: FieldValue.serverTimestamp(),
  });
  await registrarGeracao(uid);
  return { id: ref.id };
}, { ...OPCOES_IA, consomeGeracao: true });

exports.validarEscolhas = validarEscolhas;
exports.gerarComDuracao = gerarComDuracao;
exports.carregarAprendizados = carregarAprendizados;
exports.carregarRecentes = carregarRecentes;
exports.MAX_VERSOES = MAX_VERSOES;
exports.OPCOES_IA = OPCOES_IA;
exports.ganchoDe = ganchoDe;
