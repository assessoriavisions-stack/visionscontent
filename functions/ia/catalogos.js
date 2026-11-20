// Catálogos da metodologia Visions. Ajuste aqui para mudar o que a plataforma oferece.
// O index.html tem uma cópia das listas usadas na interface (mesmos ids).

const FORMATOS = {
  carrossel: 'Carrossel',
  post_unico: 'Post único',
  story_unico: 'Story único',
  sequencia_stories: 'Sequência de stories',
  reels: 'Reels',
  serie: 'Série',
};

const PILARES = {
  P1: { nome: 'P1 · Demanda', objetivo: 'Gerar demanda e alcançar quem não conhece', kpi: 'Compartilhamento', estilos: ['analise', 'pauta_quente', 'cultura_pop'] },
  P2: { nome: 'P2 · Venda', objetivo: 'Venda', kpi: 'Conversão (direct, link, mensagem)', estilos: ['historia', 'prova_social', 'tecnico', 'transformacao'] },
  P3: { nome: 'P3 · Fidelização', objetivo: 'Fidelização', kpi: 'Comentários, curtidas e salvamentos', estilos: ['noticia', 'analise', 'desejo', 'opiniao'] },
};

const ESTILOS = {
  analise: 'Análise',
  pauta_quente: 'Pauta quente',
  cultura_pop: 'Cultura pop',
  historia: 'História',
  prova_social: 'Prova social',
  tecnico: 'Técnico',
  transformacao: 'Transformação',
  noticia: 'Notícia',
  desejo: 'Desejo',
  opiniao: 'Opinião',
  bastidor: 'Bastidor',
  interacao: 'Enquete / caixinha',
};

const ANGULOS = {
  erro_comum: 'Erro comum',
  maior_desejo: 'Maior desejo',
  mito_industria: 'Mito da indústria',
  historia_pessoal: 'História pessoal',
  duvida_comum: 'Dúvida comum',
  passo_a_passo: 'Passo a passo',
};

const FORMATOS_VISUAIS = {
  talking_head: 'Talking head',
  vlog: 'Vlog / daily',
  tela_dividida: 'Tela dividida',
  storytelling_broll: 'Storytelling com b-roll',
  pov: 'POV',
  react: 'React / comentário de caso',
  tutorial_tela: 'Tutorial em tela',
};

// Tipos de gancho usados no pacote de 5 ganchos (um de cada tipo, sempre que couber).
const TIPOS_GANCHO = {
  situacao_especifica: 'Situação específica',
  dado_contraintuitivo: 'Dado que contraria o senso comum',
  afirmacao_forte: 'Afirmação forte',
  metafora: 'Metáfora que pede explicação',
  erro_comum: 'Erro comum de quem assiste',
};

// Em quais formatos o roteiro vem com 5 ganchos alternativos, e o que "gancho" significa em cada um.
// Stories ficam de fora: falam com quem já segue, a lógica ali é conversa e interação.
const GANCHOS_POR_FORMATO = {
  reels: 'abertura falada dos 3 primeiros segundos (com texto na tela e visual)',
  serie: 'abertura falada dos 3 primeiros segundos da parte (com texto na tela e visual)',
  carrossel: 'texto da capa (slide 1)',
  post_unico: 'headline da arte',
};

const QTD_GANCHOS = 5;
const QTD_ANGULOS_SUGERIDOS = 3;

// Duração máxima (segundos) quando o objetivo é crescer a base (P1) ou anúncio (P2).
const DURACAO_MAX_CRESCER_SEG = 90;

// Reaproveitamento: conteúdos que funcionaram voltam a cada 3 meses para quem posta com constância.
const REAPROVEITAR_APOS_DIAS = 90;

// Fase de crescimento do cliente. Quem decide a troca de fase e o vencedor é o admin.
const FASES_CRESCIMENTO = {
  testes: 'Testando formatos',
  vencedor_definido: 'Formato vencedor definido',
};

// Regras de teste que entram no prompt e no guia do cliente.
const REGRAS_TESTE = [
  'Cada conteúdo traz 5 ganchos diferentes para testar com Reels de teste.',
  'Mude 1 variável por vez (gancho, formato visual, ângulo ou duração) para saber exatamente o que fez diferença.',
  'Cada conteúdo fala de 1 assunto só.',
  'Para crescer a base, no máximo 1min30. Conteúdos mais longos aparecem em menor quantidade.',
  'Se nenhum gancho performar, mude a estrutura do roteiro só no ponto em que a visualização caiu.',
  'Quem posta com constância reaproveita o que funcionou a cada 3 meses, com gancho novo.',
];

module.exports = {
  FORMATOS,
  PILARES,
  ESTILOS,
  ANGULOS,
  FORMATOS_VISUAIS,
  TIPOS_GANCHO,
  GANCHOS_POR_FORMATO,
  QTD_GANCHOS,
  QTD_ANGULOS_SUGERIDOS,
  DURACAO_MAX_CRESCER_SEG,
  REAPROVEITAR_APOS_DIAS,
  FASES_CRESCIMENTO,
  REGRAS_TESTE,
};
