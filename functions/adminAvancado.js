// Fase 8: admin avançado (trava, benchmarks).
const { HttpsError } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('./lib/firebase');
const { callableAdmin } = require('./lib/middleware');
const trava = require('./ia/travaAntiIA');

const HEURISTICAS = ['frases_vazias', 'triade', 'legenda_voce_sabia', 'emoji_na_fala'];

function validarPadroes(lista) {
  if (!Array.isArray(lista) || !lista.length) throw new HttpsError('invalid-argument', 'A lista precisa ter pelo menos 1 padrão.');
  if (lista.length > 200) throw new HttpsError('invalid-argument', 'Máximo de 200 padrões.');
  const ids = new Set();
  return lista.map((p, i) => {
    const id = String(p?.id || '').trim();
    if (!/^[a-z0-9_]{2,60}$/.test(id)) throw new HttpsError('invalid-argument', `Padrão ${i + 1}: o id usa só letras minúsculas, números e _ (ex.: vale_lembrar).`);
    if (ids.has(id)) throw new HttpsError('invalid-argument', `O id "${id}" aparece duas vezes.`);
    ids.add(id);
    const tipo = p.tipo;
    const valor = String(p.valor || '').trim();
    if (!['regex', 'termo', 'heuristica'].includes(tipo)) throw new HttpsError('invalid-argument', `Padrão "${id}": tipo inválido.`);
    if (!valor) throw new HttpsError('invalid-argument', `Padrão "${id}": preencha o valor.`);
    if (valor.length > 500) throw new HttpsError('invalid-argument', `Padrão "${id}": valor longo demais.`);
    if (tipo === 'regex') {
      try {
        const re = new RegExp(valor, 'giu');
        if (re.test('')) throw new Error('casa com texto vazio');
      } catch (e) {
        throw new HttpsError('invalid-argument', `Padrão "${id}": a regex não é válida (${e.message}).`);
      }
    }
    if (tipo === 'heuristica' && !HEURISTICAS.includes(valor)) throw new HttpsError('invalid-argument', `Padrão "${id}": heurística desconhecida. Use: ${HEURISTICAS.join(', ')}.`);
    return { id, tipo, valor, descricao: String(p.descricao || '').trim().slice(0, 300), ativo: p.ativo !== false };
  });
}

exports.adminAtualizarTrava = callableAdmin(async ({ data, auth }) => {
  const padroesBase = validarPadroes(data?.padroesBase);
  await db.doc('config/travaAntiIA').set({ padroesBase, atualizadoEm: FieldValue.serverTimestamp(), atualizadoPor: auth.uid });
  return { ok: true, total: padroesBase.length };
});

// Teste ao vivo: roda a trava de verdade (mesmo código do servidor) sobre um texto de exemplo.
exports.adminTestarTrava = callableAdmin(async ({ data }) => {
  const texto = String(data?.texto || '').slice(0, 5000);
  const padroes = validarPadroes(data?.padroesBase);
  const campo = data?.campo === 'legenda' ? 'legenda' : 'fala';
  return { violacoes: trava.validar({ [campo]: texto }, padroes).map(({ padraoId, trecho }) => ({ padraoId, trecho })) };
});

const CHAVES_BENCH = {
  reels: ['retencao3s', 'tempoMedioSobreDuracao', 'taxaCompart', 'taxaSalv', 'taxaComent'],
  carrossel: ['taxaCompart', 'taxaSalv', 'taxaComent'],
  postUnico: ['taxaCompart', 'taxaSalv', 'taxaComent'],
  stories: ['retencaoSequencia', 'taxaResposta'],
};
exports.adminAtualizarBenchmarks = callableAdmin(async ({ data, auth }) => {
  const saida = {};
  for (const [grupo, chaves] of Object.entries(CHAVES_BENCH)) {
    saida[grupo] = {};
    for (const k of chaves) {
      const v = Number(data?.[grupo]?.[k]);
      if (!Number.isFinite(v) || v < 0 || v > 1) throw new HttpsError('invalid-argument', `Valor inválido em ${grupo} > ${k}. Use uma fração entre 0 e 1 (ex.: 0,02 = 2%).`);
      saida[grupo][k] = v;
    }
  }
  await db.doc('config/benchmarks').set({ ...saida, atualizadoEm: FieldValue.serverTimestamp(), atualizadoPor: auth.uid });
  return { ok: true };
});

exports.validarPadroes = validarPadroes;
