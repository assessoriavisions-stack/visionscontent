// Fase 2: DNA do perfil.
const { HttpsError } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('./lib/firebase');
const { callableCliente } = require('./lib/middleware');
const { gerarTexto, ANTHROPIC_API_KEY, registrarRespostaFalsa } = require('./ia/cliente');
const { SYSTEM_PERFIL_DE_VOZ, mensagemPerfilDeVoz } = require('./ia/prompts');
const trava = require('./ia/travaAntiIA');

const DESTINOS_VENDA = ['direct', 'whatsapp', 'link_bio', 'formulario', 'loja'];
const MIN_EXEMPLOS = 3;
const MIN_CARACTERES_EXEMPLO = 40;

// O que falta para o DNA estar completo. Lista vazia = completo.
// Usado aqui e (na Fase 3) para barrar a geração sem DNA.
function faltandoNoDna(dna) {
  const f = [];
  const n = dna?.negocio || {};
  if (!n.oQueFaz?.trim()) f.push('o que você faz');
  if (!n.paraQuem?.trim()) f.push('para quem');
  if (!DESTINOS_VENDA.includes(n.destinoVenda)) f.push('onde a venda acontece');
  if (!(dna?.produtos || []).some((p) => p?.nome?.trim())) f.push('pelo menos 1 produto');
  const eixos = dna?.tom?.eixos || {};
  for (const k of ['tecnicoProximo', 'serioIrreverente', 'formalInformal', 'calmoIntenso']) {
    if (!(eixos[k] >= 1 && eixos[k] <= 5)) { f.push('os eixos do tom'); break; }
  }
  const ex = (dna?.tom?.exemplosReais || []).filter((e) => (e || '').trim().length >= MIN_CARACTERES_EXEMPLO);
  if (ex.length < MIN_EXEMPLOS) f.push(`${MIN_EXEMPLOS} exemplos reais`);
  if (!dna?.tom?.perfilDeVozExtraido?.trim()) f.push('o perfil de voz');
  if (!dna?.temaPrincipal?.trim()) f.push('o tema principal');
  if (!(dna?.subtemas || []).some((s) => s?.trim())) f.push('pelo menos 1 subtema');
  return f;
}

async function carregarDna(uid) {
  const snap = await db.doc(`clientes/${uid}/dna/atual`).get();
  return snap.exists ? snap.data() : null;
}

// Para as functions de geração (Fase 3): barra quem ainda não completou o DNA.
async function exigirDnaCompleto(uid) {
  const dna = await carregarDna(uid);
  const falta = faltandoNoDna(dna);
  if (falta.length) {
    throw new HttpsError('failed-precondition', `Complete o DNA do seu perfil antes de gerar conteúdo. Falta: ${falta.join(', ')}.`);
  }
  return dna;
}

exports.extrairPerfilDeVoz = callableCliente(
  async (_request, { uid }) => {
    const dna = await carregarDna(uid);
    const exemplos = (dna?.tom?.exemplosReais || []).filter((e) => (e || '').trim().length >= MIN_CARACTERES_EXEMPLO);
    if (exemplos.length < MIN_EXEMPLOS) {
      throw new HttpsError('failed-precondition', `Preciso de pelo menos ${MIN_EXEMPLOS} exemplos reais seus (legendas ou falas) para entender sua voz.`);
    }
    const dnaParaPrompt = { ...dna, tom: { ...dna.tom, exemplosReais: exemplos } };
    const padroes = await trava.carregarPadroes(db, dna.palavrasProibidas);

    const primeiro = await gerarTexto({
      chave: 'perfilDeVoz',
      system: SYSTEM_PERFIL_DE_VOZ,
      mensagens: [{ role: 'user', content: mensagemPerfilDeVoz(dnaParaPrompt) }],
      maxTokens: 6000,
    });

    const resultado = await trava.aplicarTrava(primeiro, padroes, async (texto, violacoes) =>
      gerarTexto({
        chave: 'perfilDeVozReescrita',
        system: SYSTEM_PERFIL_DE_VOZ,
        mensagens: [
          { role: 'user', content: mensagemPerfilDeVoz(dnaParaPrompt) },
          { role: 'assistant', content: texto },
          { role: 'user', content: `${trava.instrucaoReescrita(violacoes)}\n\nDevolva o texto completo, já corrigido, no mesmo formato.` },
        ],
        maxTokens: 6000,
      })
    );

    await trava.registrarLogs(db, { uid, refId: null, origem: 'perfilDeVoz', historico: resultado.historico });
    await db.doc(`clientes/${uid}/dna/atual`).set(
      {
        tom: {
          perfilDeVozExtraido: resultado.conteudo,
          perfilDeVozGeradoEm: FieldValue.serverTimestamp(),
          perfilDeVozPendencias: resultado.trava.pendentes,
        },
        atualizadoEm: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { perfilDeVoz: resultado.conteudo, pendencias: resultado.trava.pendentes };
  },
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 180, memory: '512MiB' }
);

// Respostas simuladas para os emuladores (IA_FAKE=1). A primeira tem um travessão de propósito
// para exercitar a trava e o loop de reescrita.
registrarRespostaFalsa('perfilDeVoz', () =>
  [
    'Ritmo: rápido, frases que vão direto ao ponto — sem rodeio.',
    'Tamanho das frases: curtas e médias, raramente passa de duas linhas.',
    'Vocabulário: do dia a dia da cozinha, termos técnicos só quando explica.',
    'Marcas de fala: começa conversando com "gente" e usa "olha só" para virar o assunto.',
    'Pontuação e emojis: muitas exclamações, um emoji no fim da legenda.',
    'Como abre: com uma cena do próprio dia.',
    'Como fecha: com uma pergunta simples para quem lê.',
    'Evitar: palavras de catálogo e frases formais.',
  ].join('\n')
);
registrarRespostaFalsa('perfilDeVozReescrita', ({ mensagens }) =>
  mensagens[1].content.replace(' — sem rodeio', ', sem rodeio')
);

exports.faltandoNoDna = faltandoNoDna;
exports.exigirDnaCompleto = exigirDnaCompleto;
exports.DESTINOS_VENDA = DESTINOS_VENDA;
