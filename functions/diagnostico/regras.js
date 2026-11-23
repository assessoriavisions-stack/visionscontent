// Fase 5: taxas, referência e regras determinísticas do diagnóstico (seções 11.2 a 11.4).
// Tudo aqui é puro (sem Firebase) para poder testar.

const DURACAO_MAX = 90;

// Formato -> chave de config/benchmarks
const CHAVE_BENCH = { reels: 'reels', serie: 'reels', carrossel: 'carrossel', post_unico: 'postUnico', story_unico: 'stories', sequencia_stories: 'stories' };
const ehStory = (f) => f === 'story_unico' || f === 'sequencia_stories';
const ehVideo = (f) => f === 'reels' || f === 'serie';

const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const div = (a, b) => (n(a) !== null && n(b) ? a / b : null);

// 11.2 Taxas calculadas. Percentuais digitados (retenção 3s) viram fração.
function calcularTaxas(formato, m) {
  if (ehStory(formato)) {
    const frames = m.frames || [];
    const primeiro = frames[0]?.alcance;
    const ultimo = frames[frames.length - 1]?.alcance;
    let maiorQueda = null;
    for (let i = 0; i < frames.length - 1; i++) {
      const q = div((frames[i].alcance || 0) - (frames[i + 1].alcance || 0), frames[i].alcance);
      if (q !== null && (!maiorQueda || q > maiorQueda.queda)) maiorQueda = { frame: i + 1, queda: q };
    }
    const interacoes = frames.reduce((s, f) => s + (f.respostas || 0) + (f.interacoes || 0) + (f.toquesLink || 0), 0);
    return {
      alcance: n(primeiro),
      retencaoSequencia: frames.length > 1 ? div(ultimo, primeiro) : null,
      taxaResposta: div(interacoes, primeiro),
      interacoes,
      maiorQueda,
      conversao: div((m.mensagens || 0) + (m.leads || 0), primeiro),
    };
  }
  const t = {
    alcance: n(m.alcance),
    taxaCompart: div(m.compartilhamentos, m.alcance),
    taxaSalv: div(m.salvamentos, m.alcance),
    taxaComent: div(m.comentarios, m.alcance),
    taxaCurt: div(m.curtidas, m.alcance),
    conversao: div((m.mensagens || 0) + (m.leads || 0), m.alcance),
  };
  if (ehVideo(formato)) {
    t.retencao3s = n(m.retencao3s) !== null ? m.retencao3s / 100 : null;
    t.tempoMedioSobreDuracao = div(m.tempoMedioSeg, m.duracaoSeg);
    t.duracaoSeg = n(m.duracaoSeg);
  }
  return t;
}

function mediana(valores) {
  const v = valores.filter((x) => n(x) !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const NOMES_FORMATO_PLURAL = { reels: 'reels', serie: 'vídeos de série', carrossel: 'carrosséis', post_unico: 'posts únicos', story_unico: 'stories', sequencia_stories: 'sequências de stories' };

// 11.3 Referência: mediana dos últimos 10 do mesmo formato (com 3+ medidos) ou benchmarks.
function montarReferencia(formato, historico, benchmarks) {
  const mesmos = historico.filter((p) => p.formato === formato && p.taxas).slice(0, 10);
  if (mesmos.length >= 3) {
    const chaves = new Set(mesmos.flatMap((p) => Object.keys(p.taxas)));
    const ref = {};
    for (const k of chaves) {
      const md = mediana(mesmos.map((p) => p.taxas[k]));
      if (md !== null) ref[k] = md;
    }
    return { ref, propria: true, comparadoCom: `comparado com seus últimos ${mesmos.length} ${NOMES_FORMATO_PLURAL[formato] || 'posts'}` };
  }
  return {
    ref: { ...(benchmarks?.[CHAVE_BENCH[formato]] || {}) },
    propria: false,
    comparadoCom: 'comparado com a referência inicial, porque ainda temos poucos posts seus medidos',
  };
}

// KPI do pilar (para "funcionou" e "melhor post do mês").
function kpiDoPilar(pilar, t) {
  if (pilar === 'P1') return { nome: 'compartilhamento', chave: 'taxaCompart', valor: t.taxaCompart };
  if (pilar === 'P2') return { nome: 'conversão', chave: 'conversao', valor: t.conversao };
  // P3: comentários e salvamentos (stories: respostas)
  if (t.taxaResposta !== undefined) return { nome: 'respostas', chave: 'taxaResposta', valor: t.taxaResposta };
  return { nome: 'comentários', chave: 'taxaComent', valor: t.taxaComent };
}

const abaixo = (v, r) => n(v) !== null && n(r) !== null && v < r;
const acimaOuIgual = (v, r) => n(v) !== null && n(r) !== null && v >= r;
// Sem referência de alcance (sem histórico próprio), alcance conta como "ok".
const alcanceOk = (t, ref) => (n(ref.alcance) === null ? true : t.alcance >= ref.alcance * 0.8);

// Gancho vencedor dos Reels de teste: maior retenção nos 3s, desempate por visualizações.
function ganchoVencedor(variantes = []) {
  const validas = variantes.filter((v) => n(v.retencao3s) !== null || n(v.visualizacoes) !== null);
  if (validas.length < 2) return null;
  return [...validas].sort((a, b) => (b.retencao3s ?? -1) - (a.retencao3s ?? -1) || (b.visualizacoes ?? 0) - (a.visualizacoes ?? 0))[0];
}

// 11.4 Regras determinísticas + adendo de teste de formatos.
// post: { formato, pilar, metricas, frames (tipos do roteiro), tema, gancho, angulo, formatoVisual }
// anterior: último post medido com o mesmo tema (para a regra de 1 variável por vez), ou null.
function diagnosticar({ post, taxas: t, referencia, anterior = null, roteiroFrames = [] }) {
  const { formato, pilar, metricas: m } = post;
  const ref = referencia.ref;
  const achados = [];
  const add = (regra, severidade, mensagem) => achados.push({ regra, severidade, mensagem });

  if (ehVideo(formato)) {
    if (abaixo(t.retencao3s, ref.retencao3s)) {
      add('gancho_nao_segurou', 'alta', 'Gancho não segurou. Troque só o gancho antes de mexer no resto.');
    } else if (abaixo(t.tempoMedioSobreDuracao, ref.tempoMedioSobreDuracao)) {
      add('perdeu_no_meio', 'alta', 'Perdeu no meio: contexto longo ou ritmo lento.' + (n(m.segundoQueda) !== null ? ` A visualização caiu perto do segundo ${m.segundoQueda}: mude o roteiro só nesse trecho e teste de novo.` : ''));
    }
    if (n(t.duracaoSeg) !== null && t.duracaoSeg > DURACAO_MAX && (pilar === 'P2' || pilar === 'P1')) {
      add('longo_demais', 'media', pilar === 'P2' ? 'Longo demais para anúncio: acima de 1min30.' : 'Longo demais para crescer a base: acima de 1min30.');
    }
    const variantes = m.variantes || [];
    if (variantes.length >= 2) {
      const venc = ganchoVencedor(variantes);
      const algumSegurou = variantes.some((v) => n(v.retencao3s) !== null && acimaOuIgual(v.retencao3s / 100, ref.retencao3s));
      if (n(ref.retencao3s) !== null && !algumSegurou) {
        add('nenhum_gancho', 'alta', 'Nenhum dos ganchos testados segurou nos 3 primeiros segundos. Mude a estrutura do roteiro no ponto em que a visualização caiu e teste de novo.');
      } else if (venc) {
        add('gancho_vencedor', 'ok', `O gancho ${venc.n} venceu o teste. Use esse tipo de abertura nos próximos.`);
      }
    }
  }

  if (pilar === 'P1' && !ehStory(formato) && alcanceOk(t, ref) && abaixo(t.taxaCompart, ref.taxaCompart)) {
    add('p1_sem_compartilhamento', 'alta', 'Faltou ponto de identificação ou motivo para enviar a alguém.');
  }
  if (pilar === 'P2') {
    const retencaoOk = !ehVideo(formato) || !abaixo(t.retencao3s, ref.retencao3s);
    const poucas = n(ref.conversao) !== null ? abaixo(t.conversao, ref.conversao) : (m.mensagens || 0) + (m.leads || 0) === 0;
    if (alcanceOk(t, ref) && retencaoOk && poucas) add('p2_poucas_conversoes', 'alta', 'Problema no CTA, na oferta ou na confiança gerada: o post foi visto, mas pouca gente chamou.');
  }
  if (pilar === 'P3' && !ehStory(formato) && abaixo(t.taxaComent, ref.taxaComent)) {
    add('p3_poucos_comentarios', 'alta', 'CTA de comentário fraco ou tema sem espaço para opinião.');
  }
  if (formato === 'carrossel' && acimaOuIgual(t.taxaSalv, ref.taxaSalv) && abaixo(t.taxaCompart, ref.taxaCompart)) {
    add('carrossel_util_pouco_identificavel', 'media', 'Conteúdo útil, mas pouco identificável: bom para fidelizar (P3), fraco para atrair (P1).');
  }
  if (ehStory(formato)) {
    if (abaixo(t.retencaoSequencia, ref.retencaoSequencia) && t.maiorQueda) {
      const tipo = roteiroFrames[t.maiorQueda.frame - 1]?.tipo;
      add('stories_queda', 'alta', `A sequência perdeu gente. A maior queda foi depois do frame ${t.maiorQueda.frame}${tipo ? ` (${tipo})` : ''}: ${Math.round(t.maiorQueda.queda * 100)}% saíram ali.`);
    }
    if (t.interacoes === 0) add('stories_sem_interacao', 'media', 'Ninguém respondeu a interação: ela ficou pouco convidativa ou apareceu tarde demais.');
  }

  // 1 variável por vez
  if (anterior) {
    const mudou = [
      anterior.formato !== formato && 'formato',
      anterior.formatoVisual && post.formatoVisual && anterior.formatoVisual !== post.formatoVisual && 'formato visual',
      anterior.angulo !== post.angulo && 'ângulo',
      anterior.gancho && post.gancho && anterior.gancho !== post.gancho && 'gancho',
    ].filter(Boolean);
    if (mudou.length > 1) add('varias_variaveis', 'media', `Desde o último post sobre esse tema mudaram ${mudou.join(', ')}. Com mais de uma mudança, o resultado não mostra qual delas fez diferença.`);
  }

  // Funcionou: KPI do pilar acima da referência
  const kpi = kpiDoPilar(pilar, t);
  const funcionou = acimaOuIgual(kpi.valor, ref[kpi.chave]) && n(kpi.valor) > 0;
  if (funcionou) add('funcionou', 'ok', `Funcionou: ${kpi.nome} acima da referência. Guardamos o padrão (gancho, ângulo e estilo) para os próximos.`);

  return { achados, funcionou, kpi };
}

module.exports = { calcularTaxas, montarReferencia, diagnosticar, ganchoVencedor, kpiDoPilar, mediana, CHAVE_BENCH, ehStory, ehVideo };
