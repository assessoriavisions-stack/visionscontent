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


// ---------- Fase 3: geração ----------

// 9.2 Papel de cada formato (vai no prompt).
const PAPEL_FORMATO = {
  reels: 'o formato que fura a bolha e alcança quem não segue. Gancho de 3s obrigatório. Para P2 com intenção de anúncio e para P1 (crescer a base), no máximo 1min30, ideal entre 50 e 70s',
  carrossel: 'alta performance, mas dentro do público atual. Construído em storytelling: um slide puxa o próximo',
  post_unico: 'uma ideia, uma headline forte e um apoio curto',
  story_unico: 'funil quente, fala com a comunidade atual. Conexão e interação',
  sequencia_stories: 'funil quente, fala com a comunidade atual. Narrativa, conexão e interação (enquete, caixinha, quiz, reação). O objetivo é engajamento',
  serie: 'conteúdo em partes, funciona porque o conteúdo está ligado à pessoa. Cada parte termina puxando a próxima e começa retomando a anterior em uma frase',
};

// 9.3 Estilos válidos por formato. Para reels, série, carrossel e post único vale a interseção
// com os estilos do pilar. Stories têm lista própria (independente do pilar).
const ESTILOS_POR_FORMATO = {
  reels: null, // todos os estilos do pilar
  serie: null,
  carrossel: null, // pauta quente só quando o tema não depende de vídeo (o prompt avisa)
  post_unico: ['analise', 'opiniao', 'desejo', 'prova_social', 'noticia'],
  story_unico: ['historia', 'bastidor', 'prova_social', 'opiniao', 'desejo', 'interacao', 'tecnico'],
  sequencia_stories: ['historia', 'bastidor', 'prova_social', 'opiniao', 'desejo', 'interacao', 'tecnico'],
};
const FORMATOS_STORY = ['story_unico', 'sequencia_stories'];

function estilosValidos(formato, pilar) {
  const doFormato = ESTILOS_POR_FORMATO[formato];
  if (FORMATOS_STORY.includes(formato)) return doFormato;
  const doPilar = PILARES[pilar]?.estilos || [];
  return doFormato ? doPilar.filter((e) => doFormato.includes(e)) : doPilar;
}

// 9.5 Frameworks e sugestão padrão.
const FRAMEWORKS = {
  ADP: 'Antes, Depois, Ponte, sempre nessa ordem',
  AIDA: 'Atenção, Interesse, Desejo, Ação',
  CCCA: 'Consciência, Compreender, Convicção, Ação',
};
function frameworkSugerido(pilar, estilo) {
  if (pilar === 'P2' && ['transformacao', 'historia', 'prova_social'].includes(estilo)) return 'ADP';
  if (pilar === 'P2' && estilo === 'tecnico') return 'CCCA';
  if (pilar === 'P3' && estilo === 'analise') return 'CCCA';
  if (pilar === 'P2') return 'ADP';
  return 'AIDA'; // P1 e P3 (desejo, notícia, opinião)
}

// 9.6 CTAs e padrão sugerido.
const CTAS = {
  comentar: 'Comentar palavra-chave',
  salvar: 'Salvar',
  enviar: 'Enviar para alguém',
  link_bio: 'Link na bio',
  direct: 'Chamar no direct',
  enquete: 'Responder enquete/caixinha',
  parte2: 'Seguir para a próxima parte',
  sem_cta: 'Sem CTA explícito',
};
const CTA_POR_DESTINO = { direct: 'direct', whatsapp: 'link_bio', link_bio: 'link_bio', formulario: 'link_bio', loja: 'link_bio' };
function ctaSugerido(formato, pilar, destinoVenda) {
  if (FORMATOS_STORY.includes(formato)) return 'enquete';
  if (formato === 'serie') return 'parte2';
  if (pilar === 'P1') return 'enviar';
  if (pilar === 'P2') return CTA_POR_DESTINO[destinoVenda] || 'direct';
  return 'comentar';
}

// 9.7 Estilos de legenda.
const ESTILOS_LEGENDA = {
  passo_a_passo: 'Passo a passo',
  explicativa: 'Explicativa',
  curta_provocativa: 'Curta e provocativa',
  storytelling: 'Storytelling',
  lista: 'Lista',
  pergunta: 'Pergunta para comentários',
};

const FORMATOS_COM_VISUAL = ['reels', 'serie'];
const FORMATOS_COM_GANCHOS = Object.keys(GANCHOS_POR_FORMATO);
const PALAVRAS_POR_SEGUNDO = 2.5;
const DURACAO_ALVO_CORTE_SEG = 70;
const MAX_PARTES_SERIE = 10;

module.exports = {
  PAPEL_FORMATO,
  ESTILOS_POR_FORMATO,
  FORMATOS_STORY,
  estilosValidos,
  FRAMEWORKS,
  frameworkSugerido,
  CTAS,
  ctaSugerido,
  ESTILOS_LEGENDA,
  FORMATOS_COM_VISUAL,
  FORMATOS_COM_GANCHOS,
  PALAVRAS_POR_SEGUNDO,
  DURACAO_ALVO_CORTE_SEG,
  MAX_PARTES_SERIE,
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
