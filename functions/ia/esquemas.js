// Esquemas JSON da saída de cada formato (seção 9.8 + teste de formatos).
// Vão para a API como structured output; contagens e ordem são conferidas em código (validarConteudo).
const cat = require('./catalogos');

const obj = (props, obrigatorios = Object.keys(props)) => ({
  type: 'object',
  properties: props,
  required: obrigatorios,
  additionalProperties: false,
});
const str = { type: 'string' };
const int = { type: 'integer' };
const arr = (items) => ({ type: 'array', items });

const TIPOS_BLOCO = ['gancho', 'contexto', 'climax', 'apresentacao', 'conteudo', 'cta', 'encerramento'];
const TIPOS_FRAME = ['fala', 'texto', 'foto', 'video', 'enquete', 'caixinha', 'quiz', 'link'];
const FRAMES_INTERACAO = ['enquete', 'caixinha', 'quiz', 'link'];

const gancho = obj({
  n: int,
  tipo: { type: 'string', enum: Object.keys(cat.TIPOS_GANCHO) },
  texto: str,
  textoTela: str,
  visual: str,
});
const angulo = obj({ angulo: { type: 'string', enum: Object.keys(cat.ANGULOS) }, ideia: str });

const bloco = obj({ tipo: { type: 'string', enum: TIPOS_BLOCO }, tempo: str, fala: str, visual: str, textoTela: str });

const reels = obj({
  bigIdea: str,
  blocos: arr(bloco),
  ganchos: arr(gancho),
  angulosParaTestar: arr(angulo),
  legenda: str,
  notaProducao: str,
});

const serie = obj({
  nomeSerie: str,
  totalPartes: int,
  bigIdea: str,
  blocos: arr(bloco),
  ganchos: arr(gancho),
  angulosParaTestar: arr(angulo),
  legenda: str,
  notaProducao: str,
});

const carrossel = obj({
  bigIdea: str,
  slides: arr(obj({ n: int, texto: str, visual: str })),
  ganchos: arr(gancho),
  angulosParaTestar: arr(angulo),
  legenda: str,
});

const postUnico = obj({
  bigIdea: str,
  arte: obj({ headline: str, apoio: str, visual: str }),
  ganchos: arr(gancho),
  angulosParaTestar: arr(angulo),
  legenda: str,
});

const stories = obj({
  objetivoSequencia: str,
  frames: arr(obj({ n: int, tipo: { type: 'string', enum: TIPOS_FRAME }, conteudo: str, visual: str, interacao: str })),
});

const ESQUEMAS = {
  reels,
  serie,
  carrossel,
  post_unico: postUnico,
  story_unico: stories,
  sequencia_stories: stories,
};

const temas = obj({ temas: arr(obj({ tema: str, porQue: str })) });

const estrategia = obj({
  branding: obj({ posicionamento: str, promessa: str, personalidade: str, valores: arr(str), naoFazer: arr(str) }),
  editorias: arr(obj({ nome: str, descricao: str, pilar: { type: 'string', enum: ['P1', 'P2', 'P3', ''] } })),
  formatosPrioritarios: arr({ type: 'string', enum: Object.keys(cat.FORMATOS) }),
  observacaoFormatos: str,
  produtos: arr(obj({ nome: str, descricao: str, preco: str, paraQuem: str })),
});

// Palavras faladas ÷ 2,5 por segundo.
function duracaoEstimadaSeg(conteudo) {
  if (!Array.isArray(conteudo?.blocos)) return null;
  const palavras = conteudo.blocos.map((b) => (b.fala || '').match(/[\p{L}\p{N}]+/gu)?.length || 0).reduce((a, b) => a + b, 0);
  return Math.round(palavras / cat.PALAVRAS_POR_SEGUNDO);
}

// Confere o que o esquema não garante. Devolve lista de problemas (vazia = ok).
function validarConteudo(formato, c) {
  const p = [];
  if (!c || typeof c !== 'object') return ['resposta vazia'];
  if (cat.FORMATOS_COM_GANCHOS.includes(formato)) {
    if (!Array.isArray(c.ganchos) || c.ganchos.length !== cat.QTD_GANCHOS) p.push(`precisa de exatamente ${cat.QTD_GANCHOS} ganchos em "ganchos"`);
    else if (new Set(c.ganchos.map((g) => (g.texto || '').trim().toLowerCase())).size !== cat.QTD_GANCHOS) p.push('os 5 ganchos precisam ser diferentes entre si');
    if (!Array.isArray(c.angulosParaTestar) || c.angulosParaTestar.length !== cat.QTD_ANGULOS_SUGERIDOS) p.push(`precisa de exatamente ${cat.QTD_ANGULOS_SUGERIDOS} itens em "angulosParaTestar"`);
    if (!c.legenda?.trim()) p.push('falta a legenda');
  }
  if (formato === 'reels' || formato === 'serie') {
    const tipos = (c.blocos || []).map((b) => b.tipo);
    if (tipos[0] !== 'gancho') p.push('o primeiro bloco precisa ser o gancho');
    if (tipos.filter((t) => t === 'gancho').length !== 1) p.push('precisa de exatamente 1 bloco de gancho');
    if (!tipos.includes('conteudo')) p.push('falta o bloco de conteúdo');
    if (formato === 'serie' && !(c.totalPartes >= 2 && c.totalPartes <= cat.MAX_PARTES_SERIE)) p.push(`a série precisa ter entre 2 e ${cat.MAX_PARTES_SERIE} partes`);
  }
  if (formato === 'carrossel') {
    const n = (c.slides || []).length;
    if (n < 5 || n > 10) p.push('o carrossel precisa ter entre 5 e 10 slides');
  }
  if (formato === 'post_unico' && !c.arte?.headline?.trim()) p.push('falta a headline da arte');
  if (formato === 'sequencia_stories') {
    const n = (c.frames || []).length;
    if (n < 4 || n > 10) p.push('a sequência precisa ter entre 4 e 10 frames');
    if (!(c.frames || []).some((f) => FRAMES_INTERACAO.includes(f.tipo) || f.interacao?.trim())) p.push('a sequência precisa de pelo menos 1 frame de interação');
  }
  if (formato === 'story_unico' && (c.frames || []).length !== 1) p.push('story único tem exatamente 1 frame');
  return p;
}

module.exports = { ESQUEMAS, temas, estrategia, duracaoEstimadaSeg, validarConteudo, TIPOS_BLOCO, FRAMES_INTERACAO };
