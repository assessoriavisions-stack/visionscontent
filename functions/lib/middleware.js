const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db, auth, FieldValue } = require('./firebase');
const { mesReferencia } = require('./tempo');

const MSG_SUSPENSO = 'Seu acesso está suspenso. Fale com a Visions.';

function exigirLogin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sua sessão expirou. Entre de novo para continuar.');
  }
  return request.auth.uid;
}

// Admin = custom claim admin: true OU documento admins/{uid} (criado à mão no Console do Firebase).
async function ehAdmin(auth) {
  if (!auth) return false;
  if (auth.token.admin === true) return true;
  return (await db.doc(`admins/${auth.uid}`).get()).exists;
}

async function exigirAdmin(request) {
  exigirLogin(request);
  if (!(await ehAdmin(request.auth))) {
    throw new HttpsError('permission-denied', 'Só o administrador da Visions pode fazer isso.');
  }
  return request.auth.uid;
}

// Bloqueia o cliente em todas as camadas: Firestore, Auth e sessões abertas.
async function bloquearCliente(uid, origem) {
  await db.doc(`clientes/${uid}`).update({
    status: 'bloqueado',
    bloqueadoEm: FieldValue.serverTimestamp(),
    origemBloqueio: origem || 'admin',
  });
  try {
    await auth.updateUser(uid, { disabled: true });
    await auth.revokeRefreshTokens(uid);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }
}

function geracoesNoMesAtual(cliente) {
  return cliente.mesReferencia === mesReferencia() ? (cliente.geracoesNoMes || 0) : 0;
}

// Checagem que abre toda callable do cliente: autenticado, ativo, dentro do vencimento e do limite.
async function exigirClienteAtivo(request, { consomeGeracao = false } = {}) {
  const uid = exigirLogin(request);
  const snap = await db.doc(`clientes/${uid}`).get();
  if (!snap.exists) throw new HttpsError('permission-denied', MSG_SUSPENSO);
  const cliente = snap.data();

  if (cliente.status !== 'ativo') throw new HttpsError('permission-denied', MSG_SUSPENSO);

  // Se o vencimento passou e a rotina diária ainda não rodou, bloqueia agora.
  if (cliente.venceEm && cliente.venceEm.toMillis() < Date.now()) {
    await bloquearCliente(uid, 'vencimento');
    throw new HttpsError('permission-denied', MSG_SUSPENSO);
  }

  if (consomeGeracao && cliente.limiteGeracoesMes != null) {
    if (geracoesNoMesAtual(cliente) >= cliente.limiteGeracoesMes) {
      throw new HttpsError(
        'resource-exhausted',
        `Você usou as ${cliente.limiteGeracoesMes} gerações deste mês. Fale com a Visions se precisar de mais.`
      );
    }
  }
  return { uid, cliente };
}

// Soma uma geração no contador do mês (com virada de mês automática).
async function registrarGeracao(uid) {
  const ref = db.doc(`clientes/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const atual = geracoesNoMesAtual(snap.data() || {});
    const mes = mesReferencia();
    // Histórico de uso por mês (relatório do admin) além do contador do mês atual.
    tx.update(ref, { geracoesNoMes: atual + 1, mesReferencia: mes, [`geracoesPorMes.${mes}`]: FieldValue.increment(1) });
  });
}

const OPCOES_PADRAO = { region: 'southamerica-east1', maxInstances: 10 };

// Callables com tratamento de erro: qualquer erro inesperado vira mensagem clara em português.
function envolver(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error(e);
      throw new HttpsError('internal', 'Algo deu errado do nosso lado. Tente de novo em alguns minutos.');
    }
  };
}

function callableAdmin(handler, opcoes = {}) {
  return onCall({ ...OPCOES_PADRAO, ...opcoes }, envolver(async (request) => {
    await exigirAdmin(request);
    return handler(request);
  }));
}

function callableCliente(handler, { consomeGeracao = false, ...opcoes } = {}) {
  return onCall({ ...OPCOES_PADRAO, ...opcoes }, envolver(async (request) => {
    const ctx = await exigirClienteAtivo(request, { consomeGeracao });
    return handler(request, ctx);
  }));
}

module.exports = {
  MSG_SUSPENSO,
  OPCOES_PADRAO,
  exigirLogin,
  exigirAdmin,
  ehAdmin,
  exigirClienteAtivo,
  bloquearCliente,
  registrarGeracao,
  geracoesNoMesAtual,
  callableAdmin,
  callableCliente,
};
