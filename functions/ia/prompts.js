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

// ---------- estratégia, produtos e foco do mês ----------

const MAX_PLANO_NO_PROMPT = 20000; // caracteres do plano de ação colado pelo admin

function blocoProdutos(produtos = []) {
  if (!produtos.length) return 'Nenhum produto cadastrado.';
  return produtos.map((p) => `- ${p.nome}${p.preco ? ` (${p.preco})` : ''}${p.descricao ? `: ${p.descricao}` : ''}${p.paraQuem ? ` Para: ${p.paraQuem}.` : ''}`).join('\n');
}

function blocoEstrategia(e) {
  if (!e) return '';
  const b = e.branding || {};
  const l = ['ESTRATÉGIA DEFINIDA PELA VISIONS (siga sempre)'];
  if (b.posicionamento) l.push(`Posicionamento: ${b.posicionamento}`);
  if (b.promessa) l.push(`Promessa da marca: ${b.promessa}`);
  if (b.personalidade) l.push(`Personalidade da marca: ${b.personalidade}`);
  if (b.valores?.length) l.push(`Valores: ${b.valores.join(', ')}`);
  if (b.naoFazer?.length) l.push(`A marca não faz e não fala: ${b.naoFazer.join('; ')}`);
  if (e.editorias?.length) l.push(`Editorias de conteúdo:\n${e.editorias.map((x) => `- ${x.nome}${x.pilar ? ` (${x.pilar})` : ''}: ${x.descricao || ''}`).join('\n')}`);
  if (e.formatosPrioritarios?.length) l.push(`Formatos prioritários: ${e.formatosPrioritarios.map((f) => cat.FORMATOS[f] || f).join(', ')}${e.observacaoFormatos ? `. ${e.observacaoFormatos}` : ''}`);
  if (e.planoDeAcao?.trim()) l.push(`Plano de ação completo (referência):\n"""\n${e.planoDeAcao.trim().slice(0, MAX_PLANO_NO_PROMPT)}\n"""`);
  return l.length > 1 ? l.join('\n') : '';
}

// Campanha só vale dentro das datas (quando informadas).
function campanhaVigente(foco, hojeISO = new Date().toISOString().slice(0, 10)) {
  const c = foco?.campanha;
  if (!c?.ativa || !c.nome) return null;
  if (c.fim && c.fim < hojeISO) return null;
  return c;
}

function blocoFoco(foco, pilar) {
  if (!foco) return 'FOCO DO MÊS\nAinda não definido. Use o DNA e os produtos.';
  const l = ['FOCO DO MÊS'];
  const obj = cat.OBJETIVOS_PERFIL[foco.objetivoPerfil];
  if (obj) l.push(`Objetivo do perfil neste mês: ${obj.nome} (${obj.descricao.toLowerCase()}).`);
  if (foco.produtoFoco) l.push(`Produto em destaque: ${foco.produtoFoco}`);
  if (foco.objetivo) l.push(`Objetivo do mês: ${foco.objetivo}`);
  const c = campanhaVigente(foco);
  if (c) {
    l.push(`Campanha ativa: ${c.nome}${c.inicio || c.fim ? ` (${c.inicio || '...'} a ${c.fim || '...'})` : ''}`);
    if (c.oferta) l.push(`Oferta: ${c.oferta}`);
    if (c.mecanica) l.push(`Mecânica: ${c.mecanica}`);
    if (c.regras) l.push(`Regras e condições: ${c.regras}`);
    if (c.comoParticipar) l.push(`Como participar: ${c.comoParticipar}`);
    if (c.cta) l.push(`CTA da campanha: ${c.cta}`);
  }
  l.push(pilar === 'P2'
    ? 'Este conteúdo é de venda: venda o produto em destaque' + (c ? ' dentro da mecânica da campanha, com as regras e o prazo corretos. O CTA leva para a campanha.' : '.')
    : 'Conecte o conteúdo ao foco do mês quando fizer sentido, sem transformar em anúncio.' + (c ? ' Se couber, mencione a campanha de forma natural.' : ''));
  return l.join('\n');
}

function montarPromptRoteiro({ dna, escolhas, padroes, aprendizados, ganchosRecentes, campanha, serie, estrategia = null, foco = null }) {
  const { formato, pilar, estilo, angulo, tema, framework, formatoVisual, cta, estiloLegenda, editoria } = escolhas;
  const P = cat.PILARES[pilar];
  const temGanchos = cat.FORMATOS_COM_GANCHOS.includes(formato);
  const exemplos = (dna.tom?.exemplosReais || []).map((e, i) => `Exemplo ${i + 1}:\n"""\n${e}\n"""`).join('\n\n');
  const limiteDuracao = ['reels', 'serie'].includes(formato) && ['P1', 'P2'].includes(pilar)
    ? `- Este vídeo tem no máximo 1min30 (ideal entre 50 e 70s), porque o objetivo é ${pilar === 'P1' ? 'crescer a base' : 'vender e poder rodar como anúncio'}.`
    : null;
  const editoriaInfo = editoria ? (estrategia?.editorias || []).find((x) => x.nome === editoria) : null;

  // Parte fixa do cliente: vai em cache entre gerações (mesmo texto = cache aproveitado).
  const fixo = `Você escreve roteiros de conteúdo para Instagram para uma pessoa real, com a voz dela. Você não é um assistente, não explica o que está fazendo e não comenta o próprio texto. Entrega só o JSON pedido.

QUEM É A PESSOA
${blocoNegocio(dna.negocio)}
Tema principal: ${dna.temaPrincipal}. Subtemas: ${(dna.subtemas || []).join(', ')}.

O QUE ELA VENDE
${blocoProdutos(dna.produtos)}

COMO ELA FALA
${dna.tom?.perfilDeVozExtraido || ''}
Expressões que ela usa de verdade (use quando couber, sem forçar, no máximo 2 por roteiro): ${(dna.expressoesQueUsa || []).join(', ') || 'nenhuma informada'}
Exemplos reais de como ela escreve:
${exemplos}
Escreva como ela escreveria. Se um trecho soa como texto de marketing genérico, reescreva até soar como ela falando com um seguidor.

${blocoEstrategia(estrategia)}

COMO CONSTRUIR (vale para todo conteúdo)
- Defina a big idea antes de escrever: o que exatamente a pessoa precisa entender ou sentir.
- O conteúdo fala de 1 assunto só.
- Gancho de até 3 segundos que para a rolagem: uma situação específica, um dado que contraria o senso comum, uma afirmação forte ou uma metáfora que precisa ser explicada. Pergunta genérica não serve.
- Todo gancho precisa ser pago no conteúdo. Nada de promessa sem entrega.
- O conteúdo precisa deixar algo aplicável: a pessoa ganha alguma coisa ao assistir ou ler.
- Use analogias e situações concretas que dê para visualizar.
- O CTA nasce do que veio antes. Se não tiver ligação lógica, reescreva.
- Indique o visual de cada bloco: enquadramento, o que aparece, texto na tela, ritmo do corte.
- Não repita a mesma ideia com outras palavras.
- Não invente dados, estudos, números, preços ou regras de campanha. Use só o que está aqui. Se precisar de um dado que não foi fornecido, escreva [DADO: descrever o que buscar] para a pessoa preencher.

PROIBIDO (o texto será recusado se tiver qualquer um destes)
- Estrutura de contraste "não é X, é Y", "não é sobre X, é sobre Y", "não se trata de X, mas de Y", "isso não é X. É Y." e qualquer variação.
- Travessão (—) ou meia-risca usada como pausa. Use vírgula, ponto ou dois-pontos.
- Estes termos: ${termosProibidos(padroes)}
- Sequências de frases curtas de efeito sem conteúdo ("Simples assim.", "Pensa nisso.", "E tudo mudou.").
- Tríades de adjetivos ou palavras soltas ("Rápido. Fácil. Eficaz.").
- Perguntas retóricas de transição ("E sabe o que é pior?", "Sabe por quê?", "O resultado?").
- Abrir legenda com "Você sabia".
- Emojis no meio das falas do roteiro.
- Rótulos de estrutura dentro do texto final (não escreva "GANCHO:", "CTA:" dentro de fala ou legenda).`;

  const variavel = `${blocoFoco(foco, pilar)}

ESTE CONTEÚDO
Formato: ${cat.FORMATOS[formato]} (${cat.PAPEL_FORMATO[formato]})
Pilar: ${pilar}, objetivo ${P.objetivo}, KPI ${P.kpi}
Estilo: ${cat.ESTILOS[estilo]}. Ângulo: ${cat.ANGULOS[angulo]}. Tema: ${tema}
${editoriaInfo ? `Editoria: ${editoriaInfo.nome}${editoriaInfo.descricao ? ` (${editoriaInfo.descricao})` : ''}\n` : ''}Framework: ${framework} (${cat.FRAMEWORKS[framework]})
Formato visual: ${formatoVisual ? cat.FORMATOS_VISUAIS[formatoVisual] : 'não se aplica'}
CTA: ${cat.CTAS[cta]}. Estilo de legenda: ${estiloLegenda ? cat.ESTILOS_LEGENDA[estiloLegenda] : 'não se aplica'}
${campanha ? `\nCAMPANHA DO CRONOGRAMA\nEste conteúdo faz parte da campanha "${campanha.nome}". Objetivo: ${campanha.objetivo}. Oferta: ${campanha.oferta}. Fase: ${campanha.fase}.\n` : ''}${serie ? `\nSÉRIE\n${serie}\n` : ''}${pilar === 'P1' ? '\n- Para P1, procure um ponto de contato de alto interesse (assunto em alta, cultura pop, caso conhecido) que se ligue ao tema e ao nicho.' : ''}${formato === 'carrossel' && estilo === 'pauta_quente' ? '\n- Pauta quente em carrossel: escolha um recorte que funcione sem vídeo.' : ''}
${limiteDuracao || ''}
${temGanchos ? `TESTE DE FORMATOS
- Escreva 5 ganchos realmente diferentes, um de cada tipo: ${Object.values(cat.TIPOS_GANCHO).join('; ')}. Eles vão ser testados como Reels de teste: o corpo é gravado uma vez e só a abertura muda.
- Sugira 3 ângulos diferentes do ângulo usado agora para contar a mesma história em testes futuros, uma frase cada.
` : ''}
O QUE JÁ APRENDEMOS COM OS POSTS DELA
${blocoAprendizados(aprendizados)}
Ganchos já usados recentemente (não repita a estrutura): ${ganchosRecentes.length ? ganchosRecentes.map((g) => `"${g}"`).join('; ') : 'nenhum ainda'}

Responda apenas com o JSON. Campos:
${GUIA_FORMATO[formato]}`;

  return {
    system: [
      { type: 'text', text: fixo, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: variavel },
    ],
    user: 'Escreva o roteiro agora.',
  };
}

const SYSTEM_TEMAS = (dna, escolhas, recentes, melhores, estrategia = null, foco = null) => `Você sugere temas de conteúdo para Instagram para uma pessoa real. Responda só com o JSON pedido: exatamente 5 temas, cada um com "tema" (uma linha, específico, do jeito que ela falaria) e "porQue" (uma frase curta dizendo por que esse tema funciona para este conteúdo).

QUEM É A PESSOA
${blocoNegocio(dna.negocio)}
Tema principal: ${dna.temaPrincipal}. Subtemas: ${(dna.subtemas || []).join(', ')}.
O que vende:
${blocoProdutos(dna.produtos)}
Como ela fala: ${dna.tom?.perfilDeVozExtraido || ''}

${blocoEstrategia(estrategia ? { ...estrategia, planoDeAcao: '' } : null)}

${blocoFoco(foco, escolhas.pilar)}

ESTE CONTEÚDO
Formato: ${cat.FORMATOS[escolhas.formato]}. Pilar: ${escolhas.pilar} (${cat.PILARES[escolhas.pilar].objetivo}, KPI ${cat.PILARES[escolhas.pilar].kpi}). Estilo: ${cat.ESTILOS[escolhas.estilo]}. Ângulo: ${cat.ANGULOS[escolhas.angulo]}.${escolhas.editoria ? ` Editoria: ${escolhas.editoria}.` : ''}

REGRAS
- 1 assunto por tema. Temas concretos, com situação, número ou objeto que dá para visualizar.
- Use os subtemas e as editorias como ponto de partida e espalhe os 5 temas entre eles.
- Não invente dados. Não use travessão, nem contraste do tipo "não é X, é Y", nem as palavras "jornada", "é importante", "é essencial".
${escolhas.pilar === 'P1' ? '- Para P1, ligue o tema a um assunto de alto interesse (algo em alta, cultura pop, caso conhecido).\n' : ''}${melhores.length ? `- Temas que já funcionaram com ela (siga a linha, sem repetir): ${melhores.map((m) => `"${m.tema}"`).join('; ')}\n` : ''}${recentes.length ? `- Temas usados recentemente (não repita): ${recentes.map((t) => `"${t}"`).join('; ')}\n` : ''}`;

// ---------- extração do plano de ação (admin) ----------

const SYSTEM_EXTRAIR_ESTRATEGIA = `Você organiza o plano de ação de um cliente da Visions Marketing em campos estruturados. Use só o que está escrito no plano: se algo não aparece, deixe o campo vazio ("" ou lista vazia). Não invente produto, preço, valor ou editoria. Escreva em português do Brasil, frases curtas e diretas, sem travessão, sem contraste do tipo "não é X, é Y" e sem as palavras "jornada", "é importante", "é essencial".

Campos:
- branding.posicionamento: uma frase com o lugar que a marca quer ocupar na cabeça do público.
- branding.promessa: o que a marca promete entregar.
- branding.personalidade: como a marca se comporta e fala (2 ou 3 traços).
- branding.valores: valores citados no plano.
- branding.naoFazer: o que a marca não faz, não fala ou evita.
- editorias: as linhas editoriais de conteúdo, cada uma com nome curto, descrição de uma frase e pilar (P1 demanda, P2 venda, P3 fidelização; vazio se o plano não disser).
- formatosPrioritarios: formatos que o plano prioriza, usando só estes ids: reels, carrossel, post_unico, serie, sequencia_stories, story_unico.
- observacaoFormatos: observação do plano sobre formatos (frequência, estilo de gravação), ou vazio.
- produtos: produtos e serviços citados, com nome, descricao, preco (como está escrito no plano, ou vazio) e paraQuem.`;

module.exports.montarPromptRoteiro = montarPromptRoteiro;
module.exports.SYSTEM_TEMAS = SYSTEM_TEMAS;
module.exports.SYSTEM_EXTRAIR_ESTRATEGIA = SYSTEM_EXTRAIR_ESTRATEGIA;
module.exports.blocoAprendizados = blocoAprendizados;
module.exports.blocoFoco = blocoFoco;
module.exports.campanhaVigente = campanhaVigente;
