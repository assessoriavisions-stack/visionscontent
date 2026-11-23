// Fase 4: editor. "Regerar este bloco" mantendo o resto do roteiro.
const { HttpsError } = require('firebase-functions/v2/https');
const { db, Timestamp, FieldValue } = require('./lib/firebase');
const { callableCliente } = require('./lib/middleware');
const { gerarJSON, registrarRespostaFalsa } = require('./ia/cliente');
const { montarPromptRoteiro } = require('./ia/prompts');
const { ITENS, duracaoEstimadaSeg } = require('./ia/esquemas');
const trava = require('./ia/travaAntiIA');
const cat = require('./ia/catalogos');
const { exigirDnaCompleto } = require('./dna');
const { carregarEstrategiaEFoco } = require('./estrategia');
const { carregarAprendizados, carregarRecentes, MAX_VERSOES, OPCOES_IA } = require('./roteiros');

const NOMES_ITEM = { blocos: 'o bloco', ganchos: 'o gancho alternativo', slides: 'o slide', frames: 'o frame', arte: 'a arte', legenda: 'a legenda' };

// "blocos.2" -> { lista: 'blocos', i: 2 }; "arte" / "legenda" -> { lista: 'arte' }
function lerAlvo(alvo, conteudo) {
  const m = /^(blocos|ganchos|slides|frames)\.(\d{1,2})$/.exec(alvo || '');
  if (m) {
    const i = Number(m[2]);
    if (!Array.isArray(conteudo[m[1]]) || !conteudo[m[1]][i]) throw new HttpsError('invalid-argument', 'Esse bloco não existe neste roteiro.');
    return { lista: m[1], i };
  }
  if (alvo === 'arte' && conteudo.arte) return { lista: 'arte' };
  if (alvo === 'legenda') return { lista: 'legenda' };
  throw new HttpsError('invalid-argument', 'Escolha um bloco do roteiro para regerar.');
}

function itemAtual(alvo, conteudo, legenda) {
  if (alvo.lista === 'legenda') return { legenda: legenda || conteudo.legenda || '' };
  if (alvo.lista === 'arte') return conteudo.arte;
  return conteudo[alvo.lista][alvo.i];
}

function instrucaoDoItem(alvo, atual, pedido, formato) {
  const onde = alvo.i !== undefined ? `${NOMES_ITEM[alvo.lista]} ${alvo.i + 1}` : NOMES_ITEM[alvo.lista];
  const fixos = [];
  if (alvo.lista === 'blocos') fixos.push(`Mantenha tipo "${atual.tipo}" e tempo "${atual.tempo}".`);
  if (alvo.lista === 'ganchos') fixos.push(`Mantenha n=${atual.n}. Ele precisa ser diferente dos outros 4 ganchos, de preferência do tipo "${atual.tipo}", e precisa ser pago pelo mesmo conteúdo.`);
  if (alvo.lista === 'slides') fixos.push(`Mantenha n=${atual.n}.${alvo.i === 0 ? ' É a capa: precisa parar a rolagem.' : ''}`);
  if (alvo.lista === 'frames') fixos.push(`Mantenha n=${atual.n}.`);
  if (alvo.lista === 'blocos' && atual.tipo === 'gancho') fixos.push('É o gancho dos 3 primeiros segundos: precisa parar a rolagem.');
  return [
    `Reescreva só ${onde} deste ${cat.FORMATOS[formato].toLowerCase()}, mantendo a ligação com o resto do roteiro (que fica igual).`,
    ...fixos,
    pedido ? `Pedido da pessoa: "${pedido}".` : 'Faça uma versão diferente da atual, mais forte e mais com a cara dela.',
    `Versão atual:\n${JSON.stringify(atual)}`,
    'Devolva só o JSON desse item.',
  ].join('\n');
}

// Atualiza o item e mantém o gancho 1 igual à abertura usada no roteiro.
function aplicarItem(alvo, conteudo, legenda, novo, atual) {
  const c = JSON.parse(JSON.stringify(conteudo));
  let leg = legenda;
  if (alvo.lista === 'legenda') { leg = novo.legenda; c.legenda = novo.legenda; return { conteudo: c, legenda: leg }; }
  if (alvo.lista === 'arte') {
    c.arte = novo;
    if (c.ganchos?.[0]) c.ganchos[0] = { ...c.ganchos[0], texto: novo.headline, visual: novo.visual };
    return { conteudo: c, legenda: leg };
  }
  if (alvo.lista === 'blocos') novo = { ...novo, tipo: atual.tipo, tempo: atual.tempo };
  if (alvo.lista === 'ganchos' || alvo.lista === 'slides' || alvo.lista === 'frames') novo = { ...novo, n: atual.n };
  c[alvo.lista][alvo.i] = novo;
  if (alvo.lista === 'blocos' && novo.tipo === 'gancho' && c.ganchos?.[0]) c.ganchos[0] = { ...c.ganchos[0], texto: novo.fala, textoTela: novo.textoTela, visual: novo.visual };
  if (alvo.lista === 'slides' && alvo.i === 0 && c.ganchos?.[0]) c.ganchos[0] = { ...c.ganchos[0], texto: novo.texto, visual: novo.visual };
  if (alvo.lista === 'ganchos' && alvo.i === 0) {
    const ig = (c.blocos || []).findIndex((b) => b.tipo === 'gancho');
    if (ig >= 0) c.blocos[ig] = { ...c.blocos[ig], fala: novo.texto, textoTela: novo.textoTela, visual: novo.visual };
    if (c.slides?.[0]) c.slides[0] = { ...c.slides[0], texto: novo.texto };
    if (c.arte) c.arte = { ...c.arte, headline: novo.texto };
  }
  return { conteudo: c, legenda: leg };
}

function avisosDeDuracao(r, conteudo) {
  const outros = (r.avisos || []).filter((a) => !/1min30/.test(a));
  const d = duracaoEstimadaSeg(conteudo);
  if (['reels', 'serie'].includes(r.formato) && ['P1', 'P2'].includes(r.pilar) && d > cat.DURACAO_MAX_CRESCER_SEG) {
    outros.push(r.pilar === 'P2' ? 'Acima de 1min30 esse vídeo não roda bem como anúncio.' : 'Acima de 1min30 esse vídeo tende a alcançar menos gente nova. Para crescer a base, corte antes de gravar.');
  }
  return outros;
}

exports.regerarBloco = callableCliente(async ({ data }, { uid, cliente }) => {
  const id = typeof data?.roteiroId === 'string' ? data.roteiroId : '';
  if (!id) throw new HttpsError('invalid-argument', 'Roteiro não informado.');
  const pedido = typeof data.pedido === 'string' ? data.pedido.trim().slice(0, 300) : '';
  const ref = db.doc(`clientes/${uid}/roteiros/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Não encontrei esse roteiro.');
  const r = snap.data();
  if (!['rascunho', 'pronto'].includes(r.status)) throw new HttpsError('failed-precondition', 'Esse roteiro já foi postado e não muda mais.');

  const alvo = lerAlvo(data.alvo, r.conteudo);
  const atual = itemAtual(alvo, r.conteudo, r.legenda);
  const dna = await exigirDnaCompleto(uid);
  const [padroes, recentes, aprendizados, ctxEstr] = await Promise.all([
    trava.carregarPadroes(db, dna.palavrasProibidas),
    carregarRecentes(uid),
    carregarAprendizados(uid, r, cliente),
    carregarEstrategiaEFoco(uid),
  ]);
  const escolhas = { formato: r.formato, pilar: r.pilar, estilo: r.estilo, angulo: r.angulo, tema: r.tema, editoria: r.editoria || null, framework: r.framework, formatoVisual: r.formatoVisual, cta: r.cta, estiloLegenda: r.estiloLegenda };
  const prompt = montarPromptRoteiro({ dna, escolhas, padroes, aprendizados, ganchosRecentes: recentes.ganchos, campanha: null, serie: null, estrategia: ctxEstr.estrategia, foco: ctxEstr.foco });
  const conteudoAtual = { ...r.conteudo, legenda: r.legenda ?? r.conteudo.legenda };
  const base = [
    { role: 'user', content: prompt.user },
    { role: 'assistant', content: JSON.stringify(conteudoAtual) },
  ];
  const esquema = ITENS[alvo.lista];
  const validar = (x) => (x && typeof x === 'object' ? [] : ['resposta vazia']);
  const chave = `bloco:${alvo.lista}`;
  const novo = await gerarJSON({ chave, system: prompt.system, mensagens: [...base, { role: 'user', content: instrucaoDoItem(alvo, atual, pedido, r.formato) }], esquema, validar, maxTokens: 6000 });

  const res = await trava.aplicarTrava(novo, padroes, (item, violacoes) =>
    gerarJSON({
      chave: `${chave}:reescrita`,
      system: prompt.system,
      mensagens: [...base, { role: 'user', content: instrucaoDoItem(alvo, atual, pedido, r.formato) }, { role: 'assistant', content: JSON.stringify(item) }, { role: 'user', content: `${trava.instrucaoReescrita(violacoes)}\n\nDevolva só o JSON desse item.` }],
      esquema,
      validar,
      maxTokens: 6000,
    })
  );
  await trava.registrarLogs(db, { uid, refId: id, origem: 'regerarBloco', historico: res.historico });

  const { conteudo, legenda } = aplicarItem(alvo, r.conteudo, r.legenda, res.conteudo, atual);
  const prefixo = alvo.lista === 'legenda' ? '' : alvo.i !== undefined ? `${alvo.lista}.${alvo.i}.` : `${alvo.lista}.`;
  const campoNovo = (campo) => (alvo.lista === 'legenda' ? 'legenda' : `${prefixo}${campo}`);
  // Marcas antigas continuam só onde o texto não mudou; as do item novo entram com o caminho completo.
  const valorDe = (caminho) => caminho.split('.').reduce((o, k) => (o == null ? o : o[k]), { ...conteudo, legenda });
  const antigas = (r.trava?.pendentes || []).filter((p) => typeof valorDe(p.campo) === 'string' && valorDe(p.campo).includes(p.trecho));
  const novas = res.trava.pendentes.map((p) => ({ ...p, campo: campoNovo(p.campo) }));
  const pendentes = [...antigas.filter((a) => !novas.some((n) => n.campo === a.campo && n.trecho === a.trecho)), ...novas];

  const versoes = [...(r.versoes || []), { conteudo, legenda, editadoPor: 'ia', alvo: data.alvo, em: Timestamp.now(), pendentes }].slice(-MAX_VERSOES);
  await ref.update({
    conteudo,
    legenda,
    duracaoEstimadaSeg: duracaoEstimadaSeg(conteudo),
    avisos: avisosDeDuracao(r, conteudo),
    'trava.pendentes': pendentes,
    'trava.passou': pendentes.length === 0,
    ...(res.trava.violacoesEncontradas.length
      ? { 'trava.violacoesEncontradas': FieldValue.arrayUnion(...res.trava.violacoesEncontradas.map((v) => ({ ...v, campo: campoNovo(v.campo) }))) }
      : {}),
    versoes,
    atualizadoEm: FieldValue.serverTimestamp(),
  });
  return { ok: true, pendentes: novas.length };
}, OPCOES_IA);

// Respostas simuladas (emuladores com IA_FAKE=1). A primeira traz "é essencial" de propósito.
registrarRespostaFalsa('bloco:blocos', ({ mensagens }) => {
  const atual = JSON.parse(/Versão atual:\n(.+)\n/.exec(mensagens[mensagens.length - 1].content)[1]);
  return { ...atual, fala: 'É essencial medir o forno antes de cada fornada, com um termômetro de vinte reais.' };
});
registrarRespostaFalsa('bloco:blocos:reescrita', ({ mensagens }) => JSON.parse(mensagens[mensagens.length - 2].content.replace('É essencial medir', 'Meça')));
registrarRespostaFalsa('bloco:legenda', () => ({ legenda: 'Testei três sextas seguidas e o bolo parou de murchar. Comenta FORNO que eu te mando a tabela.' }));
registrarRespostaFalsa('bloco:ganchos', ({ mensagens }) => {
  const atual = JSON.parse(/Versão atual:\n(.+)\n/.exec(mensagens[mensagens.length - 1].content)[1]);
  return { ...atual, texto: 'Meu forno marcava 180 e estava em 210.', textoTela: 'Forno mentiroso' };
});
for (const l of ['slides', 'frames', 'arte', 'legenda', 'ganchos']) {
  registrarRespostaFalsa(`bloco:${l}:reescrita`, ({ mensagens }) => JSON.parse(mensagens[mensagens.length - 2].content));
}
registrarRespostaFalsa('bloco:slides', ({ mensagens }) => ({ ...JSON.parse(/Versão atual:\n(.+)\n/.exec(mensagens[mensagens.length - 1].content)[1]), texto: 'Slide reescrito pela IA.' }));
registrarRespostaFalsa('bloco:frames', ({ mensagens }) => ({ ...JSON.parse(/Versão atual:\n(.+)\n/.exec(mensagens[mensagens.length - 1].content)[1]), conteudo: 'Frame reescrito pela IA.' }));
registrarRespostaFalsa('bloco:arte', () => ({ headline: 'Headline nova', apoio: 'Apoio novo', visual: 'Visual novo' }));

exports.lerAlvo = lerAlvo;
exports.aplicarItem = aplicarItem;
