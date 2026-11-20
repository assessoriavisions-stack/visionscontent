// Teste de aceite da Fase 3 com a API real: 20 gerações variadas, e nenhuma pode chegar
// com padrão da trava sem marcação. Não usa Firebase: roda o mesmo código de prompt,
// geração, trava e regra de 90s das functions, com um perfil de demonstração.
//
// Uso (no Terminal, dentro da pasta functions):
//   read -s ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY && node scripts/testeRealGeracao.js
// (o "read -s" pede a chave sem mostrar na tela; cole e aperte Enter)
//
// Custo aproximado: alguns dólares na conta da Anthropic (20 roteiros + reescritas).
const fs = require('fs');
const path = require('path');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Defina a chave antes: read -s ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY');
  process.exit(1);
}
// Modelo: o mesmo do functions/.env
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
process.env.MODEL_ID = process.env.MODEL_ID || (env.match(/^MODEL_ID=(.+)$/m) || [])[1] || 'claude-opus-5-5';
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'teste-local';

const { montarPromptRoteiro } = require('../ia/prompts');
const { gerarComDuracao } = require('../roteiros');
const { validar } = require('../ia/travaAntiIA');
const { duracaoEstimadaSeg, validarConteudo } = require('../ia/esquemas');
const { padroesBase } = require('../config/seedPadrao');
const cat = require('../ia/catalogos');

const DNA = {
  negocio: {
    oQueFaz: 'Faço bolos de pote e doces para festas em Campinas, tudo na cozinha de casa.',
    paraQuem: 'Mães que organizam a festa dos filhos em casa e não têm tempo de cozinhar.',
    diferencial: 'Massa sem conservante e entrega no mesmo dia.',
    ofertaPrincipal: 'Kit festa com 30 bolos de pote',
    destinoVenda: 'whatsapp',
  },
  tom: {
    eixos: { tecnicoProximo: 4, serioIrreverente: 3, formalInformal: 5, calmoIntenso: 3 },
    exemplosReais: [
      'Gente, hoje saiu fornada dupla porque a encomenda de sábado chegou mais cedo! Quem pediu o kit de ninho com morango já pode separar a geladeira que amanhã cedo eu levo.',
      'Olha só o recheio novo que eu testei essa semana: brigadeiro de café com creme de baunilha. Ficou cremoso, não escorre no pote e meu marido comeu três seguidos. Vai entrar no cardápio de dezembro.',
      'Ontem uma cliente me perguntou por que o meu bolo não murcha no dia seguinte. Não tem segredo nenhum: eu deixo a massa descansar meia hora na geladeira antes de assar e uso termômetro no forno.',
    ],
    perfilDeVozExtraido: [
      'Ritmo: rápido, conversa direta com quem lê.',
      'Tamanho das frases: curtas e médias.',
      'Vocabulário: do dia a dia da cozinha, explica termo técnico quando usa.',
      'Marcas de fala: abre com "gente" e vira o assunto com "olha só".',
      'Pontuação e emojis: exclamação de vez em quando, sem emoji no meio do texto.',
      'Como abre: com uma cena do próprio dia.',
      'Como fecha: com uma pergunta simples ou um convite para pedir.',
      'Evitar: palavras de catálogo e frases formais.',
    ].join('\n'),
  },
  expressoesQueUsa: ['gente', 'olha só', 'bora'],
  palavrasProibidas: ['gourmet'],
  temaPrincipal: 'Confeitaria caseira que vende',
  subtemas: ['forno e massa', 'precificação', 'bastidores da produção', 'encomendas de festa'],
};
const PADROES = [...padroesBase, { id: 'cliente_proibida_0', tipo: 'termo', valor: 'gourmet', ativo: true, descricao: 'palavra proibida do perfil' }];

const COMBOS = [
  { formato: 'reels', pilar: 'P1', estilo: 'cultura_pop', angulo: 'mito_industria', tema: 'o bolo de novela que todo mundo quer copiar', formatoVisual: 'react', cta: 'enviar', estiloLegenda: 'curta_provocativa' },
  { formato: 'reels', pilar: 'P1', estilo: 'analise', angulo: 'erro_comum', tema: 'por que o bolo de pote murcha no segundo dia', formatoVisual: 'talking_head', cta: 'enviar', estiloLegenda: 'explicativa' },
  { formato: 'reels', pilar: 'P2', estilo: 'transformacao', angulo: 'historia_pessoal', tema: 'de 5 potes por semana para 200 em dezembro', formatoVisual: 'storytelling_broll', cta: 'link_bio', estiloLegenda: 'storytelling' },
  { formato: 'reels', pilar: 'P2', estilo: 'prova_social', angulo: 'maior_desejo', tema: 'a festa de aniversário que eu salvei em 6 horas', formatoVisual: 'vlog', cta: 'direct', estiloLegenda: 'storytelling' },
  { formato: 'reels', pilar: 'P2', estilo: 'tecnico', angulo: 'passo_a_passo', tema: 'como calcular quantos potes encomendar por convidado', formatoVisual: 'tutorial_tela', cta: 'link_bio', estiloLegenda: 'passo_a_passo' },
  { formato: 'reels', pilar: 'P3', estilo: 'opiniao', angulo: 'duvida_comum', tema: 'vale a pena pagar mais caro em bolo artesanal', formatoVisual: 'talking_head', cta: 'comentar', estiloLegenda: 'pergunta' },
  { formato: 'reels', pilar: 'P3', estilo: 'desejo', angulo: 'maior_desejo', tema: 'a mesa de doces que eu queria na minha festa de criança', formatoVisual: 'pov', cta: 'comentar', estiloLegenda: 'storytelling' },
  { formato: 'carrossel', pilar: 'P1', estilo: 'analise', angulo: 'mito_industria', tema: 'o mito do fermento: mais não faz o bolo crescer mais', cta: 'salvar', estiloLegenda: 'lista' },
  { formato: 'carrossel', pilar: 'P2', estilo: 'prova_social', angulo: 'historia_pessoal', tema: 'o que 3 clientes disseram depois da primeira encomenda', cta: 'link_bio', estiloLegenda: 'explicativa' },
  { formato: 'carrossel', pilar: 'P3', estilo: 'noticia', angulo: 'duvida_comum', tema: 'o preço do chocolate subiu: o que muda nos meus potes', cta: 'comentar', estiloLegenda: 'explicativa' },
  { formato: 'carrossel', pilar: 'P2', estilo: 'tecnico', angulo: 'passo_a_passo', tema: 'como conservar o bolo de pote por 5 dias', cta: 'direct', estiloLegenda: 'passo_a_passo' },
  { formato: 'post_unico', pilar: 'P3', estilo: 'opiniao', angulo: 'mito_industria', tema: 'bolo bonito demais costuma ser seco', cta: 'comentar', estiloLegenda: 'curta_provocativa' },
  { formato: 'post_unico', pilar: 'P2', estilo: 'prova_social', angulo: 'maior_desejo', tema: '40 encomendas no último sábado', cta: 'link_bio', estiloLegenda: 'explicativa' },
  { formato: 'post_unico', pilar: 'P1', estilo: 'analise', angulo: 'erro_comum', tema: 'o erro de embalagem que estraga o bolo na entrega', cta: 'enviar', estiloLegenda: 'lista' },
  { formato: 'sequencia_stories', pilar: 'P3', estilo: 'bastidor', angulo: 'historia_pessoal', tema: 'um sábado de produção do começo ao fim', cta: 'enquete' },
  { formato: 'sequencia_stories', pilar: 'P2', estilo: 'interacao', angulo: 'duvida_comum', tema: 'qual sabor entra no cardápio de dezembro', cta: 'enquete' },
  { formato: 'story_unico', pilar: 'P3', estilo: 'desejo', angulo: 'maior_desejo', tema: 'a primeira fornada de panetone de pote', cta: 'enquete' },
  { formato: 'serie', pilar: 'P1', estilo: 'analise', angulo: 'passo_a_passo', tema: 'como eu precifico um bolo de pote', formatoVisual: 'talking_head', cta: 'parte2', estiloLegenda: 'passo_a_passo' },
  { formato: 'serie', pilar: 'P2', estilo: 'historia', angulo: 'historia_pessoal', tema: 'como saí do emprego para vender bolo', formatoVisual: 'storytelling_broll', cta: 'parte2', estiloLegenda: 'storytelling' },
  { formato: 'reels', pilar: 'P1', estilo: 'pauta_quente', angulo: 'erro_comum', tema: 'a receita viral de bolo de caneca que não funciona no forno', formatoVisual: 'tela_dividida', cta: 'enviar', estiloLegenda: 'curta_provocativa' },
];

async function rodar(i, combo, ganchosRecentes) {
  const escolhas = { ...combo, framework: cat.frameworkSugerido(combo.pilar, combo.estilo), formatoVisual: combo.formatoVisual || null, estiloLegenda: combo.estiloLegenda || null };
  const serie = combo.formato === 'serie' ? 'Esta é a parte 1. Defina o nome da série e quantas partes ela terá. Termine puxando a parte 2.' : null;
  const prompt = montarPromptRoteiro({ dna: DNA, escolhas, padroes: PADROES, aprendizados: { vencedor: null, diagnosticos: [], melhores: [] }, ganchosRecentes, campanha: null, serie });
  const inicio = Date.now();
  const r = await gerarComDuracao({ escolhas, prompt, padroes: PADROES });
  const segundos = Math.round((Date.now() - inicio) / 1000);

  // Conferência independente: tudo que a trava acha no texto final precisa estar marcado.
  const achados = validar(r.conteudo, PADROES);
  const marcados = new Set(r.trava.pendentes.map((p) => `${p.padraoId}|${p.campo}|${p.trecho}`));
  const semMarcacao = achados.filter((a) => !marcados.has(`${a.padraoId}|${a.campo}|${a.trecho}`));
  return {
    n: i + 1,
    escolhas,
    segundos,
    duracaoSeg: duracaoEstimadaSeg(r.conteudo),
    avisos: r.avisos,
    problemasDeFormato: validarConteudo(escolhas.formato, r.conteudo),
    tentativasReescrita: r.trava.tentativas,
    violacoesDaIA: r.trava.violacoesEncontradas.length,
    pendentesMarcados: r.trava.pendentes,
    semMarcacao,
    conteudo: r.conteudo,
  };
}

(async () => {
  console.log(`Modelo: ${process.env.MODEL_ID}. Gerando ${COMBOS.length} roteiros (4 por vez)...\n`);
  const resultados = [];
  const ganchos = [];
  for (let i = 0; i < COMBOS.length; i += 4) {
    const lote = COMBOS.slice(i, i + 4).map((c, j) => rodar(i + j, c, ganchos.slice(-10)).catch((e) => ({ n: i + j + 1, escolhas: c, erro: e.message })));
    const feitos = await Promise.all(lote);
    if (feitos.every((r) => r.erro && /fora do ar/.test(r.erro))) {
      console.error('A API recusou a chave. Confira se colou a chave certa (começa com sk-ant-) e rode de novo.');
      process.exit(1);
    }
    for (const r of feitos) {
      resultados.push(r);
      const g = r.conteudo?.blocos?.[0]?.fala || r.conteudo?.slides?.[0]?.texto || r.conteudo?.arte?.headline;
      if (g) ganchos.push(g.slice(0, 160));
      if (r.erro) console.log(`${String(r.n).padStart(2)}. ${r.escolhas.formato} ${r.escolhas.pilar}: ERRO ${r.erro}`);
      else console.log(`${String(r.n).padStart(2)}. ${cat.FORMATOS[r.escolhas.formato].padEnd(20)} ${r.escolhas.pilar}  ${String(r.segundos).padStart(3)}s  IA tentou ${String(r.violacoesDaIA).padStart(2)} padrões, ${r.pendentesMarcados.length} marcados, ${r.semMarcacao.length} sem marcação${r.duracaoSeg ? `, vídeo ~${r.duracaoSeg}s` : ''}${r.avisos.length ? ' (aviso de duração)' : ''}${r.problemasDeFormato.length ? ` FORMATO: ${r.problemasDeFormato.join('; ')}` : ''}`);
    }
  }
  const ok = resultados.filter((r) => !r.erro);
  const semMarcacao = ok.reduce((a, r) => a + r.semMarcacao.length, 0);
  console.log('\n===== RESULTADO =====');
  console.log(`Gerados: ${ok.length} de ${COMBOS.length}`);
  console.log(`Padrões que a IA tentou usar: ${ok.reduce((a, r) => a + r.violacoesDaIA, 0)}`);
  console.log(`Ficaram marcados para o cliente reescrever: ${ok.reduce((a, r) => a + r.pendentesMarcados.length, 0)}`);
  console.log(`Chegaram SEM marcação: ${semMarcacao}  ${semMarcacao === 0 && ok.length === COMBOS.length ? '-> ACEITE OK' : '-> ACEITE FALHOU'}`);
  const arquivo = path.join(process.cwd(), 'teste-real-resultado.json');
  fs.writeFileSync(arquivo, JSON.stringify(resultados, null, 2));
  console.log(`\nRoteiros completos salvos em ${arquivo} (mande esse arquivo para o Claude revisar a qualidade).`);
})();
