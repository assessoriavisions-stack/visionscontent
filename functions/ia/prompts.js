// Prompts e montagem de contexto. O prompt-base de roteiro (seção 10.1) entra na Fase 3.

const EIXOS = {
  tecnicoProximo: ['Técnico', 'Próximo'],
  serioIrreverente: ['Sério', 'Irreverente'],
  formalInformal: ['Formal', 'Informal'],
  calmoIntenso: ['Calmo', 'Intenso'],
};

function descreverEixos(eixos = {}) {
  return Object.entries(EIXOS)
    .map(([k, [a, b]]) => `- ${a} (1) a ${b} (5): ${eixos[k] ?? 3}`)
    .join('\n');
}

const SYSTEM_PERFIL_DE_VOZ = `Você analisa como uma pessoa real escreve e fala no Instagram e descreve a voz dela para que outro redator consiga imitá-la. Você não elogia, não explica o que está fazendo e não usa linguagem de marketing.

Responda em português do Brasil, em texto simples, com até 8 linhas curtas, cada uma começando pelo rótulo:
Ritmo:
Tamanho das frases:
Vocabulário:
Marcas de fala:
Pontuação e emojis:
Como abre:
Como fecha:
Evitar:

Regras da sua própria escrita: não use travessão, não use contraste do tipo "não é X, é Y", não use as expressões "é importante", "é essencial", "jornada", "nesse contexto". Baseie cada linha no que aparece nos exemplos. Se algo não aparece, diga o que os exemplos sugerem, sem inventar.`;

function mensagemPerfilDeVoz(dna) {
  const exemplos = (dna.tom?.exemplosReais || []).map((e, i) => `Exemplo ${i + 1}:\n"""\n${e}\n"""`).join('\n\n');
  return `Quem é a pessoa: ${dna.negocio?.oQueFaz || 'não informado'}. Fala com: ${dna.negocio?.paraQuem || 'não informado'}.

Como ela mesma se vê no tom (escala de 1 a 5):
${descreverEixos(dna.tom?.eixos)}

Expressões que ela diz usar: ${(dna.expressoesQueUsa || []).join(', ') || 'nenhuma informada'}

Textos reais dela (legendas ou transcrições):

${exemplos}

Descreva a voz dela no formato pedido.`;
}

module.exports = { EIXOS, descreverEixos, SYSTEM_PERFIL_DE_VOZ, mensagemPerfilDeVoz };
