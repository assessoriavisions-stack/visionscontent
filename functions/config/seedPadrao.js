// Valores iniciais de config/*. O seed só cria o que ainda não existe;
// depois disso o admin edita pela plataforma.
//
// Regras de comparação (aplicadas pela trava na Fase 3):
// - o texto é comparado em minúsculas e sem acentos (NFD sem diacríticos),
//   por isso as regex aceitam as duas formas ("n[ãa]o") e \b funciona normalmente;
// - termos com " / " são alternativas: qualquer uma conta como violação;
// - tipo "heuristica" roda em código; o id permite desligar pelo admin.

const padroesBase = [
  {
    id: 'contraste_nao_e',
    tipo: 'regex',
    valor: String.raw`\bn[ãa]o\s+(?:[ée]|eh)\s+(?:sobre\s+|s[óo]\s+|apenas\s+)?[^.!?\n]{1,80}?[,.;:]\s*(?:mas\s+)?(?:[ée]|eh)\b`,
    descricao: '"não é X, é Y", "não é sobre X, é sobre Y", "isso não é X. É Y."',
  },
  {
    id: 'contraste_nao_se_trata',
    tipo: 'regex',
    valor: String.raw`\bn[ãa]o\s+se\s+trata\s+de\b`,
    descricao: '"não se trata de"',
  },
  {
    id: 'contraste_mais_do_que',
    tipo: 'regex',
    valor: String.raw`\bmais\s+do\s+que\s+(?:um|uma)\b[^.!?\n]{1,60}[,.]\s*(?:[ée]|eh)\b`,
    descricao: '"mais do que um X, é Y"',
  },
  { id: 'travessao', tipo: 'regex', valor: '[—–]', descricao: 'travessão e meia-risca' },
  { id: 'nesse_contexto', tipo: 'termo', valor: 'nesse contexto / neste contexto', descricao: '' },
  { id: 'e_importante', tipo: 'termo', valor: 'é importante', descricao: '' },
  { id: 'e_essencial', tipo: 'termo', valor: 'é essencial / é fundamental / é crucial', descricao: '' },
  { id: 'ninguem_conta', tipo: 'termo', valor: 'ninguém te conta / o que ninguém fala', descricao: '' },
  { id: 'vale_ressaltar', tipo: 'termo', valor: 'vale ressaltar / vale lembrar / vale destacar', descricao: '' },
  { id: 'em_suma', tipo: 'termo', valor: 'em suma / em resumo / em síntese', descricao: '' },
  { id: 'mundo_hoje', tipo: 'termo', valor: 'no mundo de hoje / nos dias de hoje / cada vez mais', descricao: '' },
  {
    id: 'verbos_ia',
    tipo: 'termo',
    valor: 'mergulhar / desvendar / desbloquear / potencializar / alavancar',
    descricao: 'revisar com o tempo',
  },
  { id: 'jornada', tipo: 'termo', valor: 'jornada', descricao: 'revisar com o tempo' },
  {
    id: 'pergunta_retorica',
    tipo: 'regex',
    valor: String.raw`\b(?:sabe\s+(?:o\s+que|por\s*qu[eê])|o\s+resultado\s*\?|e\s+o\s+melhor\s*\?|e\s+o\s+pior\s*\?)`,
    descricao: '"Sabe o que é pior?", "Sabe por quê?", "O resultado?"',
  },
  {
    id: 'frases_vazias',
    tipo: 'heuristica',
    valor: 'frases_vazias',
    descricao: '3 ou mais frases seguidas com até 4 palavras cada',
  },
  {
    id: 'triade',
    tipo: 'heuristica',
    valor: 'triade',
    descricao: '3 palavras ou expressões curtas separadas por ponto na mesma linha ("Rápido. Fácil. Eficaz.")',
  },
  // Itens da seção "PROIBIDO" do prompt que não estavam na tabela base,
  // incluídos para que a trava também os garanta no servidor.
  {
    id: 'legenda_voce_sabia',
    tipo: 'heuristica',
    valor: 'legenda_voce_sabia',
    descricao: 'legenda abrindo com "Você sabia"',
  },
  {
    id: 'emoji_na_fala',
    tipo: 'heuristica',
    valor: 'emoji_na_fala',
    descricao: 'emoji no meio das falas do roteiro',
  },
  {
    id: 'rotulo_estrutura',
    tipo: 'regex',
    valor: String.raw`\b(?:gancho|cta|contexto|climax|cl[íi]max|encerramento|apresenta[çc][ãa]o)\s*:`,
    descricao: 'rótulo de estrutura dentro do texto ("GANCHO:", "CTA:")',
  },
].map((p) => ({ ...p, ativo: true }));

const benchmarks = {
  reels: { retencao3s: 0.30, tempoMedioSobreDuracao: 0.40, taxaCompart: 0.01, taxaSalv: 0.01, taxaComent: 0.005 },
  carrossel: { taxaCompart: 0.01, taxaSalv: 0.02, taxaComent: 0.005 },
  postUnico: { taxaCompart: 0.005, taxaSalv: 0.01, taxaComent: 0.005 },
  stories: { retencaoSequencia: 0.10, taxaResposta: 0.01 },
};

module.exports = { padroesBase, benchmarks };
