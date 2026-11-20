const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { db, auth, FieldValue, Timestamp } = require('./lib/firebase');
const { callableAdmin, bloquearCliente, OPCOES_PADRAO } = require('./lib/middleware');
const { mesReferencia, fimDoDiaBRT, FUSO } = require('./lib/tempo');
const seed = require('./config/seedPadrao');
const cat = require('./ia/catalogos');

// ---------- validação de entrada ----------

function texto(v, campo, { obrigatorio = false, max = 200 } = {}) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (obrigatorio && !s) throw new HttpsError('invalid-argument', `Preencha o campo ${campo}.`);
  if (s.length > max) throw new HttpsError('invalid-argument', `O campo ${campo} passou de ${max} caracteres.`);
  return s;
}

function emailValido(v) {
  const s = texto(v, 'e-mail', { obrigatorio: true }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    throw new HttpsError('invalid-argument', 'Esse e-mail não parece válido. Confira e tente de novo.');
  }
  return s;
}

function vencimento(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = fimDoDiaBRT(v);
  if (!d) throw new HttpsError('invalid-argument', 'Data de vencimento inválida. Use o seletor de data.');
  return Timestamp.fromDate(d);
}

function limite(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 10000) {
    throw new HttpsError('invalid-argument', 'O limite mensal precisa ser um número inteiro entre 0 e 10000, ou ficar em branco (sem limite).');
  }
  return n;
}

function perfil(v) {
  return texto(v, 'perfil do Instagram', { max: 60 }).replace(/^@+/, '');
}

// Fase de crescimento: o admin decide quando o cliente sai dos testes e qual é o formato vencedor.
function crescimento(v) {
  if (!v || typeof v !== 'object') throw new HttpsError('invalid-argument', 'Dados da fase de crescimento inválidos.');
  if (!(v.fase in cat.FASES_CRESCIMENTO)) throw new HttpsError('invalid-argument', 'Escolha a fase: testando formatos ou vencedor definido.');
  if (v.fase === 'testes') return { fase: 'testes', vencedor: null };
  const w = v.vencedor || {};
  const opcional = (valor, lista, nomeCampo) => {
    if (valor === null || valor === undefined || valor === '') return null;
    if (!(valor in lista)) throw new HttpsError('invalid-argument', `Valor inválido em ${nomeCampo}.`);
    return valor;
  };
  const vencedor = {
    formato: opcional(w.formato, cat.FORMATOS, 'formato'),
    formatoVisual: opcional(w.formatoVisual, cat.FORMATOS_VISUAIS, 'formato visual'),
    angulo: opcional(w.angulo, cat.ANGULOS, 'ângulo'),
    tipoGancho: opcional(w.tipoGancho, cat.TIPOS_GANCHO, 'tipo de gancho'),
    observacao: texto(w.observacao, 'observação', { max: 500 }),
  };
  if (!vencedor.formato) throw new HttpsError('invalid-argument', 'Escolha pelo menos o formato vencedor.');
  return { fase: 'vencedor_definido', vencedor };
}

function uidValido(v) {
  if (typeof v !== 'string' || !v) throw new HttpsError('invalid-argument', 'Cliente não informado.');
  return v;
}

// Senha provisória legível (sem 0/O, 1/l/I).
function gerarSenha() {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const parte = () => Array.from({ length: 4 }, () => alfabeto[crypto.randomInt(alfabeto.length)]).join('');
  return `${parte()}-${parte()}-${parte()}`;
}

async function carregarCliente(uid) {
  const ref = db.doc(`clientes/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Cliente não encontrado.');
  return { ref, dados: snap.data() };
}

// ---------- callables do admin ----------

exports.adminCriarCliente = callableAdmin(async ({ data }) => {
  const nome = texto(data.nome, 'nome', { obrigatorio: true, max: 120 });
  const email = emailValido(data.email);
  const perfilInstagram = perfil(data.perfilInstagram);
  const venceEm = vencimento(data.venceEm);
  const limiteGeracoesMes = limite(data.limiteGeracoesMes);

  if (venceEm && venceEm.toMillis() < Date.now()) {
    throw new HttpsError('invalid-argument', 'A data de vencimento já passou. Escolha uma data futura.');
  }

  const senhaProvisoria = gerarSenha();
  let usuario;
  try {
    usuario = await auth.createUser({ email, password: senhaProvisoria, displayName: nome });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Já existe um login com esse e-mail.');
    }
    throw e;
  }

  try {
    await db.doc(`clientes/${usuario.uid}`).set({
      nome,
      email,
      perfilInstagram,
      status: 'ativo',
      venceEm,
      limiteGeracoesMes,
      geracoesNoMes: 0,
      mesReferencia: mesReferencia(),
      criadoEm: FieldValue.serverTimestamp(),
      bloqueadoEm: null,
      fcmTokens: [],
      crescimento: { fase: 'testes', vencedor: null, definidoEm: null },
    });
  } catch (e) {
    // Não deixa login órfão sem documento.
    await auth.deleteUser(usuario.uid).catch(() => {});
    throw e;
  }

  return { uid: usuario.uid, email, senhaProvisoria };
});

exports.adminAtualizarCliente = callableAdmin(async ({ data }) => {
  const uid = uidValido(data.uid);
  const { ref } = await carregarCliente(uid);
  const mudancas = {};
  if ('nome' in data) mudancas.nome = texto(data.nome, 'nome', { obrigatorio: true, max: 120 });
  if ('perfilInstagram' in data) mudancas.perfilInstagram = perfil(data.perfilInstagram);
  if ('venceEm' in data) mudancas.venceEm = vencimento(data.venceEm);
  if ('limiteGeracoesMes' in data) mudancas.limiteGeracoesMes = limite(data.limiteGeracoesMes);
  if ('crescimento' in data) {
    mudancas.crescimento = { ...crescimento(data.crescimento), definidoEm: FieldValue.serverTimestamp() };
  }
  if (!Object.keys(mudancas).length) return { ok: true };

  await ref.update(mudancas);
  if (mudancas.nome) await auth.updateUser(uid, { displayName: mudancas.nome }).catch(() => {});
  return { ok: true };
});

exports.adminBloquearCliente = callableAdmin(async ({ data }) => {
  const uid = uidValido(data.uid);
  await carregarCliente(uid);
  await bloquearCliente(uid, 'admin');
  return { ok: true };
});

exports.adminDesbloquearCliente = callableAdmin(async ({ data }) => {
  const uid = uidValido(data.uid);
  const { ref, dados } = await carregarCliente(uid);
  if (dados.venceEm && dados.venceEm.toMillis() < Date.now()) {
    throw new HttpsError(
      'failed-precondition',
      'O vencimento deste cliente já passou. Defina uma nova data (ou deixe sem vencimento) antes de desbloquear.'
    );
  }
  await auth.updateUser(uid, { disabled: false });
  await ref.update({ status: 'ativo', bloqueadoEm: null, origemBloqueio: null });
  return { ok: true };
});

exports.adminRedefinirSenha = callableAdmin(async ({ data }) => {
  const uid = uidValido(data.uid);
  await carregarCliente(uid);
  const senhaProvisoria = gerarSenha();
  await auth.updateUser(uid, { password: senhaProvisoria });
  await auth.revokeRefreshTokens(uid);
  return { senhaProvisoria };
});

// Cria config/travaAntiIA e config/benchmarks se ainda não existirem. Nunca sobrescreve.
async function inicializarConfig() {
  const criados = [];
  const agora = FieldValue.serverTimestamp();
  const alvos = [
    ['config/travaAntiIA', { padroesBase: seed.padroesBase, atualizadoEm: agora }],
    ['config/benchmarks', { ...seed.benchmarks, atualizadoEm: agora }],
  ];
  for (const [caminho, valor] of alvos) {
    const ref = db.doc(caminho);
    const criou = await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return false;
      tx.set(ref, valor);
      return true;
    });
    if (criou) criados.push(caminho);
  }
  return criados;
}
exports.inicializarConfig = inicializarConfig;

exports.adminInicializarConfig = callableAdmin(async () => ({ criados: await inicializarConfig() }));

// ---------- rotinas agendadas ----------

exports.verificarVencimentos = onSchedule(
  { ...OPCOES_PADRAO, schedule: '0 3 * * *', timeZone: FUSO },
  async () => {
    // Consulta só por venceEm (índice simples) e filtra o status em código.
    const snap = await db.collection('clientes').where('venceEm', '<=', Timestamp.now()).get();
    const ativos = snap.docs.filter((d) => d.data().status === 'ativo');
    for (const d of ativos) {
      await bloquearCliente(d.id, 'vencimento');
    }
    console.log(`verificarVencimentos: ${ativos.length} cliente(s) bloqueado(s).`);
  }
);

exports.resetarContadorMensal = onSchedule(
  { ...OPCOES_PADRAO, schedule: '5 0 1 * *', timeZone: FUSO },
  async () => {
    const mes = mesReferencia();
    const snap = await db.collection('clientes').get();
    let lote = db.batch();
    let n = 0;
    for (const d of snap.docs) {
      lote.update(d.ref, { geracoesNoMes: 0, mesReferencia: mes });
      if (++n % 400 === 0) {
        await lote.commit();
        lote = db.batch();
      }
    }
    await lote.commit();
    console.log(`resetarContadorMensal: ${n} cliente(s) zerado(s) para ${mes}.`);
  }
);
