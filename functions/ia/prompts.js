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

// ======================================================================
// Fase 3: prompt de roteiro (seção 10.1 + teste de formatos)
// ======================================================================
const cat = require('./catalogos');

const DESTINOS = { direct: 'direct do Instagram', whatsapp: 'WhatsApp', link_bio: 'link na bio', formulario: 'formulário', loja: 'loja' };

function blocoNegocio(n = {}) {
  return [
    `O que faz: ${n.oQueFaz || '-'}`,
    `Para quem: ${n.paraQuem || '-'}`,
    n.diferencial ? `Diferencial: ${n.diferencial}` : null,
    n.ofertaPrincipal ? `Oferta principal: ${n.ofertaPrincipal}` : null,
    `Onde a venda acontece: ${DESTINOS[n.destinoVenda] || '-'}`,
  ].filter(Boolean).join('\n');
}

// O que cada formato devolve (o esquema JSON garante a forma; aqui vai o significado de cada campo).
const GUIA_FORMATO = {
  reels: `- bigIdea: a frase que resume o que o vídeo precisa transmitir.
- blocos, nesta ordem: gancho (tempo 00:00-00:03), contexto, climax, apresentacao (opcional; se existir, no ponto de maior retenção), conteudo, cta, encerramento. Cada bloco com tempo ("00:03-00:12"), fala (o que a pessoa diz), visual (enquadramento, o que aparece, ritmo do corte) e textoTela (vazio se não tiver).
- ganchos: 5 aberturas alternativas para os 3 primeiros segundos. O de n=1 é o mesmo do bloco de gancho. Cada uma de um tipo diferente. texto = fala da abertura; textoTela e visual da abertura. Todas precisam ser pagas pelo mesmo conteúdo.
- angulosParaTestar: 3 ângulos diferentes do usado agora, cada um com uma frase de ideia para contar a mesma história por outro caminho.
- legenda.
- notaProducao: dica curta de gravação ou edição.`,
  carrossel: `- bigIdea.
- slides: entre 5 e 10. Slide 1 é o gancho (capa). O último carrega o CTA. Cada slide com n, texto e visual.
- ganchos: 5 capas alternativas para o slide 1, cada uma de um tipo diferente. O de n=1 é a capa usada nos slides. texto = texto da capa; textoTela vazio; visual da capa.
- angulosParaTestar: 3 ângulos diferentes do usado, com uma frase de ideia cada.
- legenda.`,
  post_unico: `- bigIdea.
- arte: headline, apoio (curto) e visual.
- ganchos: 5 headlines alternativas, cada uma de um tipo diferente. O de n=1 é a headline da arte. texto = headline; textoTela vazio; visual da arte.
- angulosParaTestar: 3 ângulos diferentes do usado, com uma frase de ideia cada.
- legenda.`,
  sequencia_stories: `- objetivoSequencia.
- frames: entre 4 e 10, com pelo menos 1 de interação (enquete, caixinha, quiz ou link). Cada frame com n, tipo, conteudo, visual e interacao (texto da enquete/caixinha, ou vazio).`,
  story_unico: `- objetivoSequencia.
- frames: exatamente 1 frame com n, tipo, conteudo, visual e interacao (texto da enquete/caixinha, ou vazio).`,
};
GUIA_FORMATO.serie = `- nomeSerie e totalPartes (entre 2 e ${cat.MAX_PARTES_SERIE}).
${GUIA_FORMATO.reels}`;

function termosProibidos(padroes) {
  return padroes
    .filter((p) => p.ativo !== false && p.tipo === 'termo')
    .flatMap((p) => p.valor.split('/').map((v) => `"${v.trim()}"`))
    .join(', ');
}

function blocoAprendizados({ vencedor, diagnosticos, melhores }) {
  const linhas = [];
  if (vencedor) {
    const partes = [
      cat.FORMATOS[vencedor.formato],
      vencedor.formatoVisual && `formato visual ${cat.FORMATOS_VISUAIS[vencedor.formatoVisual]}`,
      vencedor.angulo && `ângulo ${cat.ANGULOS[vencedor.angulo]}`,
      vencedor.tipoGancho && `gancho do tipo ${cat.TIPOS_GANCHO[vencedor.tipoGancho]}`,
    ].filter(Boolean).join(', ');
    linhas.push(`Formato vencedor desta pessoa (definido pela Visions): ${partes}.${vencedor.observacao ? ` Observação: ${vencedor.observacao}` : ''} Priorize esse caminho quando ele couber nas escolhas deste conteúdo.`);
  } else {
    linhas.push('Esta pessoa está na fase de testes de formato: ainda não sabemos o que funciona melhor para ela. Por isso os 5 ganchos e os 3 ângulos importam muito.');
  }
  for (const d of diagnosticos) linhas.push(`- Post anterior (${cat.FORMATOS[d.formato] || d.formato}, ${d.pilar}): ${[...d.achados, ...d.ajustes].join(' ')}`);
  for (const m of melhores) linhas.push(`- Funcionou bem: tema "${m.tema}", ângulo ${cat.ANGULOS[m.angulo] || m.angulo}, gancho "${m.gancho}".`);
  return linhas.join('\n');
}

function montarPromptRoteiro({ dna, escolhas, padroes, aprendizados, ganchosRecentes, campanha, serie }) {
  const { formato, pilar, estilo, angulo, tema, framework, formatoVisual, cta, estiloLegenda } = escolhas;
  const P = cat.PILARES[pilar];
  const temGanchos = cat.FORMATOS_COM_GANCHOS.includes(formato);
  const exemplos = (dna.tom?.exemplosReais || []).map((e, i) => `Exemplo ${i + 1}:\n"""\n${e}\n"""`).join('\n\n');
  const limiteDuracao = ['reels', 'serie'].includes(formato) && ['P1', 'P2'].includes(pilar)
    ? `- Este vídeo tem no máximo 1min30 (ideal entre 50 e 70s), porque o objetivo é ${pilar === 'P1' ? 'crescer a base' : 'vender e poder rodar como anúncio'}.`
    : null;

  const system = `Você escreve roteiros de conteúdo para Instagram para uma pessoa real, com a voz dela. Você não é um assistente, não explica o que está fazendo e não comenta o próprio texto. Entrega só o JSON pedido.

QUEM É A PESSOA
${blocoNegocio(dna.negocio)}
Tema principal: ${dna.temaPrincipal}. Subtemas: ${(dna.subtemas || []).join(', ')}.

COMO ELA FALA
${dna.tom?.perfilDeVozExtraido || ''}
Expressões que ela usa de verdade (use quando couber, sem forçar, no máximo 2 por roteiro): ${(dna.expressoesQueUsa || []).join(', ') || 'nenhuma informada'}
Exemplos reais de como ela escreve:
${exemplos}
Escreva como ela escreveria. Se um trecho soa como texto de marketing genérico, reescreva até soar como ela falando com um seguidor.

ESTE CONTEÚDO
Formato: ${cat.FORMATOS[formato]} (${cat.PAPEL_FORMATO[formato]})
Pilar: ${pilar}, objetivo ${P.objetivo}, KPI ${P.kpi}
Estilo: ${cat.ESTILOS[estilo]}. Ângulo: ${cat.ANGULOS[angulo]}. Tema: ${tema}
Framework: ${framework} (${cat.FRAMEWORKS[framework]})
Formato visual: ${formatoVisual ? cat.FORMATOS_VISUAIS[formatoVisual] : 'não se aplica'}
CTA: ${cat.CTAS[cta]}. Estilo de legenda: ${estiloLegenda ? cat.ESTILOS_LEGENDA[estiloLegenda] : 'não se aplica'}
${campanha ? `\nCAMPANHA\nEste conteúdo faz parte da campanha "${campanha.nome}". Objetivo: ${campanha.objetivo}. Oferta: ${campanha.oferta}. Fase: ${campanha.fase}.\n` : ''}${serie ? `\nSÉRIE\n${serie}\n` : ''}
COMO CONSTRUIR
- Defina a big idea antes de escrever: o que exatamente a pessoa precisa entender ou sentir.
- O conteúdo fala de 1 assunto só.
- Gancho de até 3 segundos que para a rolagem: uma situação específica, um dado que contraria o senso comum, uma afirmação forte ou uma metáfora que precisa ser explicada. Pergunta genérica não serve.
- Todo gancho precisa ser pago no conteúdo. Nada de promessa sem entrega.
- O conteúdo precisa deixar algo aplicável: a pessoa ganha alguma coisa ao assistir ou ler.
- Use analogias e situações concretas que dê para visualizar.
- O CTA nasce do que veio antes. Se não tiver ligação lógica, reescreva.${pilar === 'P1' ? '\n- Para P1, procure um ponto de contato de alto interesse (assunto em alta, cultura pop, caso conhecido) que se ligue ao tema e ao nicho.' : ''}${formato === 'carrossel' && estilo === 'pauta_quente' ? '\n- Pauta quente em carrossel: escolha um recorte que funcione sem vídeo.' : ''}
- Indique o visual de cada bloco: enquadramento, o que aparece, texto na tela, ritmo do corte.
- Não repita a mesma ideia com outras palavras.
- Não invente dados, estudos ou números. Se precisar de um dado que não foi fornecido, escreva [DADO: descrever o que buscar] para a pessoa preencher.
${limiteDuracao || ''}
${temGanchos ? `TESTE DE FORMATOS
- Escreva 5 ganchos realmente diferentes, um de cada tipo: ${Object.values(cat.TIPOS_GANCHO).join('; ')}. Eles vão ser testados como Reels de teste: o corpo é gravado uma vez e só a abertura muda.
- Sugira 3 ângulos diferentes do ângulo usado agora para contar a mesma história em testes futuros, uma frase cada.
` : ''}
O QUE JÁ APRENDEMOS COM OS POSTS DELA
${blocoAprendizados(aprendizados)}
Ganchos já usados recentemente (não repita a estrutura): ${ganchosRecentes.length ? ganchosRecentes.map((g) => `"${g}"`).join('; ') : 'nenhum ainda'}

PROIBIDO (o texto será recusado se tiver qualquer um destes)
- Estrutura de contraste "não é X, é Y", "não é sobre X, é sobre Y", "não se trata de X, mas de Y", "isso não é X. É Y." e qualquer variação.
- Travessão (—) ou meia-risca usada como pausa. Use vírgula, ponto ou dois-pontos.
- Estes termos: ${termosProibidos(padroes)}
- Sequências de frases curtas de efeito sem conteúdo ("Simples assim.", "Pensa nisso.", "E tudo mudou.").
- Tríades de adjetivos ou palavras soltas ("Rápido. Fácil. Eficaz.").
- Perguntas retóricas de transição ("E sabe o que é pior?", "Sabe por quê?", "O resultado?").
- Abrir legenda com "Você sabia".
- Emojis no meio das falas do roteiro.
- Rótulos de estrutura dentro do texto final (não escreva "GANCHO:", "CTA:" dentro de fala ou legenda).

Responda apenas com o JSON. Campos:
${GUIA_FORMATO[formato]}`;

  return { system, user: 'Escreva o roteiro agora.' };
}

const SYSTEM_TEMAS = (dna, escolhas, recentes, melhores) => `Você sugere temas de conteúdo para Instagram para uma pessoa real. Responda só com o JSON pedido: exatamente 5 temas, cada um com "tema" (uma linha, específico, do jeito que ela falaria) e "porQue" (uma frase curta dizendo por que esse tema funciona para este conteúdo).

QUEM É A PESSOA
${blocoNegocio(dna.negocio)}
Tema principal: ${dna.temaPrincipal}. Subtemas: ${(dna.subtemas || []).join(', ')}.
Como ela fala: ${dna.tom?.perfilDeVozExtraido || ''}

ESTE CONTEÚDO
Formato: ${cat.FORMATOS[escolhas.formato]}. Pilar: ${escolhas.pilar} (${cat.PILARES[escolhas.pilar].objetivo}, KPI ${cat.PILARES[escolhas.pilar].kpi}). Estilo: ${cat.ESTILOS[escolhas.estilo]}. Ângulo: ${cat.ANGULOS[escolhas.angulo]}.

REGRAS
- 1 assunto por tema. Temas concretos, com situação, número ou objeto que dá para visualizar.
- Use os subtemas como ponto de partida e espalhe os 5 temas entre eles.
- Não invente dados. Não use travessão, nem contraste do tipo "não é X, é Y", nem as palavras "jornada", "é importante", "é essencial".
${escolhas.pilar === 'P1' ? '- Para P1, ligue o tema a um assunto de alto interesse (algo em alta, cultura pop, caso conhecido).\n' : ''}${melhores.length ? `- Temas que já funcionaram com ela (siga a linha, sem repetir): ${melhores.map((m) => `"${m.tema}"`).join('; ')}\n` : ''}${recentes.length ? `- Temas usados recentemente (não repita): ${recentes.map((t) => `"${t}"`).join('; ')}\n` : ''}`;

module.exports.montarPromptRoteiro = montarPromptRoteiro;
module.exports.SYSTEM_TEMAS = SYSTEM_TEMAS;
module.exports.blocoAprendizados = blocoAprendizados;
