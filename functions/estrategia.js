// Estratégia do cliente (admin), produtos (DNA) e foco do mês.
const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('./lib/firebase');
const { callableAdmin } = require('./lib/middleware');
const { mesReferencia } = require('./lib/tempo');
const { gerarJSON, ANTHROPIC_API_KEY, registrarRespostaFalsa } = require('./ia/cliente');
const { SYSTEM_EXTRAIR_ESTRATEGIA } = require('./ia/prompts');
const { estrategia: ESQUEMA_ESTRATEGIA } = require('./ia/esquemas');
const trava = require('./ia/travaAntiIA');

const MAX_PLANO = 60000;

// Contexto estratégico usado na geração: estratégia (admin) + foco do mês atual (se houver).
async function carregarEstrategiaEFoco(uid) {
  const [e, f] = await Promise.all([
    db.doc(`clientes/${uid}/estrategia/atual`).get(),
    db.doc(`clientes/${uid}/focos/${mesReferencia()}`).get(),
  ]);
  return { estrategia: e.exists ? e.data() : null, foco: f.exists ? f.data() : null };
}

// Lê o plano de ação colado e devolve os campos organizados para o admin revisar (não salva).
exports.adminExtrairEstrategia = callableAdmin(async ({ data }) => {
  const plano = typeof data?.plano === 'string' ? data.plano.trim() : '';
  if (plano.length < 200) throw new HttpsError('invalid-argument', 'Cole o plano de ação completo (pelo menos alguns parágrafos).');
  if (plano.length > MAX_PLANO) throw new HttpsError('invalid-argument', 'O plano passou do tamanho máximo. Tire anexos e partes repetidas e tente de novo.');

  const padroes = await trava.carregarPadroes(db);
  const mensagens = [{ role: 'user', content: `Plano de ação:\n"""\n${plano}\n"""\n\nOrganize nos campos pedidos.` }];
  const validar = () => [];
  const primeiro = await gerarJSON({ chave: 'estrategia', system: SYSTEM_EXTRAIR_ESTRATEGIA, mensagens, esquema: ESQUEMA_ESTRATEGIA, validar, maxTokens: 12000 });
  const r = await trava.aplicarTrava(primeiro, padroes, (atual, violacoes) =>
    gerarJSON({
      chave: 'estrategiaReescrita',
      system: SYSTEM_EXTRAIR_ESTRATEGIA,
      mensagens: [...mensagens, { role: 'assistant', content: JSON.stringify(atual) }, { role: 'user', content: `${trava.instrucaoReescrita(violacoes)}\n\nDevolva o JSON completo.` }],
      esquema: ESQUEMA_ESTRATEGIA,
      validar,
      maxTokens: 12000,
    })
  );
  return { estrategia: r.conteudo, pendencias: r.trava.pendentes };
}, { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: '512MiB' });

registrarRespostaFalsa('estrategia', () => ({
  branding: {
    posicionamento: 'A confeitaria de bairro que entrega bolo de festa sem estresse para mães ocupadas.',
    promessa: 'Festa resolvida com doce caseiro e entrega no mesmo dia.',
    personalidade: 'Próxima, bem-humorada, prática.',
    valores: ['ingrediente de verdade', 'pontualidade'],
    naoFazer: ['falar difícil', 'prometer prazo que não cumpre'],
  },
  editorias: [
    { nome: 'Bastidores da cozinha', descricao: 'Produção real, erros e acertos.', pilar: 'P3' },
    { nome: 'Festa sem estresse', descricao: 'Dicas para mães organizarem a festa.', pilar: 'P1' },
    { nome: 'Kit festa', descricao: 'Oferta e prova social do kit.', pilar: 'P2' },
  ],
  formatosPrioritarios: ['reels', 'carrossel'],
  observacaoFormatos: 'Reels 3 vezes por semana — talking head na cozinha.',
  produtos: [{ nome: 'Kit festa 30 potes', descricao: 'Bolos de pote sortidos.', preco: 'R$ 270', paraQuem: 'Festas de até 30 pessoas' }],
  negocio: { oQueFaz: 'Bolos de pote e doces para festas em Campinas.', paraQuem: 'Mães que organizam festa em casa.', diferencial: 'Entrega no mesmo dia.', ofertaPrincipal: 'Kit festa 30 potes', destinoVenda: 'whatsapp' },
  temaPrincipal: 'Confeitaria caseira que vende',
  subtemas: ['forno', 'precificação', 'bastidores'],
  expressoesQueUsa: ['gente', 'olha só'],
  eixos: { tecnicoProximo: 5, serioIrreverente: 4, formalInformal: 5, calmoIntenso: 0 },
}));
registrarRespostaFalsa('estrategiaReescrita', ({ mensagens }) => mensagens[mensagens.length - 2].content.replace(' — talking head', ', talking head'));

exports.carregarEstrategiaEFoco = carregarEstrategiaEFoco;
