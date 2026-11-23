// Respostas simuladas da IA, usadas só nos emuladores com IA_FAKE=1 (functions/.env.local).
// Trazem violações de propósito para exercitar a trava, as marcações e a regra de duração.
const { registrarRespostaFalsa } = require('./cliente');

const temaDo = (system) => (system.match(/Tema: (.+)$/m) || [])[1] || 'bolo de pote';
const ultimaMensagem = (mensagens) => mensagens[mensagens.length - 1].content;

const ganchos = (tema) => [
  { n: 1, tipo: 'situacao_especifica', texto: `Sexta passada eu joguei fora 12 potes de ${tema}.`, textoTela: '12 potes no lixo', visual: 'Close na lixeira' },
  { n: 2, tipo: 'dado_contraintuitivo', texto: 'Quanto mais tempo no forno, mais seco ele fica por dentro.', textoTela: 'Mais forno, menos bolo', visual: 'Timer do forno' },
  { n: 3, tipo: 'afirmacao_forte', texto: 'O seu forno está mentindo a temperatura para você.', textoTela: 'Seu forno mente', visual: 'Termômetro dentro do forno' },
  { n: 4, tipo: 'metafora', texto: 'Massa de bolo é igual gente: precisa descansar antes de trabalhar.', textoTela: 'A massa precisa dormir', visual: 'Massa na geladeira' },
  { n: 5, tipo: 'erro_comum', texto: 'Se você abre o forno para espiar, já perdeu o bolo.', textoTela: 'Pare de espiar', visual: 'Mão abrindo o forno' },
];
const angulos = [
  { angulo: 'historia_pessoal', ideia: 'O dia em que perdi uma encomenda inteira por causa do forno.' },
  { angulo: 'mito_industria', ideia: 'A receita de internet que manda assar em fogo alto.' },
  { angulo: 'passo_a_passo', ideia: 'Os 3 ajustes de forno antes de cada fornada.' },
];

function blocosReels(tema, longo) {
  const recheio = longo ? ' Depois eu explico cada etapa com calma, mostro a bancada, a balança, o termômetro, o pote, a tampa e a etiqueta, e conto como eu organizo a semana de produção para dar conta das encomendas sem perder a qualidade.'.repeat(5) : '';
  return [
    { tipo: 'gancho', tempo: '00:00-00:03', fala: `Sexta passada eu joguei fora 12 potes de ${tema}.`, visual: 'Close na lixeira, câmera na mão', textoTela: '12 potes no lixo' },
    { tipo: 'contexto', tempo: '00:03-00:12', fala: 'É importante saber que o forno de casa varia muito — o meu marcava 180 e estava em 210.', visual: 'Plano médio na cozinha', textoTela: '' },
    { tipo: 'conteudo', tempo: '00:12-00:40', fala: `Coloca um termômetro de forno de vinte reais lá dentro e ajusta pelo número dele.${recheio}`, visual: 'Close no termômetro', textoTela: 'Termômetro de forno' },
    { tipo: 'cta', tempo: '00:40-00:46', fala: 'Manda esse vídeo para aquela amiga que vive queimando bolo.', visual: 'Olhando para a câmera', textoTela: 'Manda pra ela' },
    { tipo: 'encerramento', tempo: '00:46-00:50', fala: 'Amanhã eu mostro o meu.', visual: 'Sorriso, corte seco', textoTela: '' },
  ];
}

function conteudoFalso(formato, system, longo) {
  const tema = temaDo(system);
  const legenda = 'Essa foi uma parte da minha jornada na cozinha. Comenta FORNO que eu te mando a tabela de temperaturas.';
  if (formato === 'reels' || formato === 'serie') {
    const comCampanha = /Campanha ativa: (.+)/.exec(system);
    const base = { bigIdea: `Forno de casa engana: meça a temperatura de verdade.${comCampanha ? ` Campanha: ${comCampanha[1].split(' (')[0]}.` : ''}`, blocos: blocosReels(tema, longo), ganchos: ganchos(tema), angulosParaTestar: angulos, legenda, notaProducao: /Post anterior \(/.test(system) ? 'Grave o gancho com luz natural. [com aprendizado dos posts anteriores]' : 'Grave o gancho com luz natural.' };
    return formato === 'serie' ? { nomeSerie: 'Forno sem mistério', totalPartes: 3, ...base } : base;
  }
  if (formato === 'carrossel') {
    return {
      bigIdea: 'Forno de casa engana.',
      slides: [1, 2, 3, 4, 5, 6].map((n) => ({ n, texto: n === 1 ? `12 potes de ${tema} no lixo` : n === 6 ? 'Comenta FORNO que eu te mando a tabela' : `Ajuste ${n - 1}: confira a temperatura com termômetro.`, visual: 'Foto da bancada' })),
      ganchos: ganchos(tema), angulosParaTestar: angulos, legenda,
    };
  }
  if (formato === 'post_unico') {
    return { bigIdea: 'Forno de casa engana.', arte: { headline: 'Seu forno mente a temperatura', apoio: 'Um termômetro de vinte reais resolve.', visual: 'Termômetro no forno' }, ganchos: ganchos(tema), angulosParaTestar: angulos, legenda };
  }
  const frames = [
    { n: 1, tipo: 'fala', conteudo: 'Gente, olha o que aconteceu hoje cedo na cozinha.', visual: 'Selfie', interacao: '' },
    { n: 2, tipo: 'video', conteudo: 'A fornada saiu queimada por baixo.', visual: 'Close na forma', interacao: '' },
    { n: 3, tipo: 'enquete', conteudo: 'Isso já aconteceu com você?', visual: 'Fundo liso', interacao: 'Sim, toda semana / Nunca' },
    { n: 4, tipo: 'texto', conteudo: 'Amanhã eu conto o que mudei.', visual: 'Foto da bancada limpa', interacao: '' },
  ];
  return { objetivoSequencia: 'Gerar conversa sobre erro de forno.', frames: formato === 'story_unico' ? frames.slice(2, 3) : frames };
}

for (const formato of ['reels', 'serie', 'carrossel', 'post_unico', 'story_unico', 'sequencia_stories']) {
  registrarRespostaFalsa(`roteiro:${formato}`, ({ system, mensagens }) => {
    const pedindoCorte = /Corte para no máximo/.test(ultimaMensagem(mensagens));
    const longo = /LONGO/.test(temaDo(system)) && !pedindoCorte;
    const muitoLongo = /LONGUISSIMO/.test(temaDo(system)); // continua longo mesmo depois do corte
    return conteudoFalso(formato, system, longo || muitoLongo);
  });
  // A reescrita corrige "É importante", mas a IA "insiste" em "jornada" (fica marcada para o cliente).
  registrarRespostaFalsa(`roteiroReescrita:${formato}`, ({ mensagens }) => {
    const anterior = mensagens[mensagens.length - 2].content;
    return anterior.replace(/É importante saber que o forno/g, 'O forno');
  });
}

registrarRespostaFalsa('temas', () => ({
  temas: [
    { tema: 'Quanto custa de verdade um pote de 250 ml', porQue: 'Precificação gera conversa.' },
    { tema: 'Os 3 erros de forno que derrubam o bolo', porQue: 'Erro comum é fácil de compartilhar.' },
    { tema: 'Minha jornada até o primeiro kit festa', porQue: 'História pessoal aproxima.' },
    { tema: 'O pote que mais vende na minha cozinha', porQue: 'Prova social.' },
    { tema: 'Como eu organizo 40 encomendas no sábado', porQue: 'Bastidor mostra processo.' },
  ],
}));
registrarRespostaFalsa('temasReescrita', ({ mensagens }) => mensagens[mensagens.length - 2].content);
