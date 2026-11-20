// Aceite da Fase 1: cliente bloqueado não loga, não lê dados e não chama functions,
// mesmo com sessão aberta antes do bloqueio. Roda contra os emuladores.
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const admin = require('firebase-admin');

const PROJETO = 'visionscontent-cba52';
admin.initializeApp({ projectId: PROJETO });

let n = 0;
function novoApp() {
  const app = initializeApp({ apiKey: 'fake', projectId: PROJETO, authDomain: `${PROJETO}.firebaseapp.com` }, `app${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fns = getFunctions(app, 'southamerica-east1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  return { app, auth, db, chamar: (nome, dados) => httpsCallable(fns, nome)(dados).then((r) => r.data) };
}

async function negado(promessa, codigo = 'permission-denied') {
  await assert.rejects(promessa, (e) => {
    assert.match(String(e.code), new RegExp(codigo));
    return true;
  });
}

test('fluxo completo de acesso e bloqueio', async (t) => {
  // Admin inicial
  const adminUser = await admin.auth().createUser({ email: 'leo@visions.test', password: 'senha-admin-123' });
  await admin.auth().setCustomUserClaims(adminUser.uid, { admin: true });
  const A = novoApp();
  await signInWithEmailAndPassword(A.auth, 'leo@visions.test', 'senha-admin-123');

  const seed = await A.chamar('adminInicializarConfig', {});
  assert.deepEqual(seed.criados.sort(), ['config/benchmarks', 'config/travaAntiIA']);
  const seed2 = await A.chamar('adminInicializarConfig', {});
  assert.deepEqual(seed2.criados, [], 'seed não sobrescreve');

  const { uid, senhaProvisoria } = await A.chamar('adminCriarCliente', {
    nome: 'Ana Teste', email: 'ana@cliente.test', perfilInstagram: '@ana', venceEm: null, limiteGeracoesMes: 30,
  });
  assert.ok(senhaProvisoria.length >= 12);
  await negado(A.chamar('adminCriarCliente', { nome: 'Dup', email: 'ana@cliente.test' }), 'already-exists');

  // Cliente entra e usa normalmente
  const C = novoApp();
  await signInWithEmailAndPassword(C.auth, 'ana@cliente.test', senhaProvisoria);
  const meu = await getDoc(doc(C.db, 'clientes', uid));
  assert.equal(meu.data().status, 'ativo');
  await setDoc(doc(C.db, 'clientes', uid, 'dna', 'atual'), { temaPrincipal: 'confeitaria' });
  assert.equal((await C.chamar('clienteVerificarAcesso', {})).ok, true);

  await t.test('cliente não mexe em campos protegidos nem em config', async () => {
    await negado(updateDoc(doc(C.db, 'clientes', uid), { status: 'ativo', limiteGeracoesMes: 9999 }));
    await negado(getDoc(doc(C.db, 'config', 'travaAntiIA')));
    await negado(A.chamar('adminCriarCliente', { nome: 'x', email: 'x@x.test' }).then(() => C.chamar('adminBloquearCliente', { uid })));
  });

  await t.test('outro cliente não lê dados alheios', async () => {
    const outro = await A.chamar('adminCriarCliente', { nome: 'Bia', email: 'bia@cliente.test' });
    const B = novoApp();
    await signInWithEmailAndPassword(B.auth, 'bia@cliente.test', outro.senhaProvisoria);
    await negado(getDoc(doc(B.db, 'clientes', uid)));
    await negado(getDoc(doc(B.db, 'clientes', uid, 'dna', 'atual')));
    await deleteApp(B.app);
  });

  await t.test('bloqueio com sessão aberta', async () => {
    await A.chamar('adminBloquearCliente', { uid });

    // Sessão antiga, token ainda válido
    await negado(getDoc(doc(C.db, 'clientes', uid)));
    await negado(getDoc(doc(C.db, 'clientes', uid, 'dna', 'atual')));
    await negado(setDoc(doc(C.db, 'clientes', uid, 'dna', 'atual'), { temaPrincipal: 'outro' }));
    await assert.rejects(C.chamar('clienteVerificarAcesso', {}), (e) => {
      assert.match(e.code, /permission-denied/);
      assert.match(e.message, /^Seu acesso está suspenso\. Fale com a Visions\./);
      return true;
    });

    // Novo login
    const C2 = novoApp();
    await negado(signInWithEmailAndPassword(C2.auth, 'ana@cliente.test', senhaProvisoria), 'user-disabled');
    await deleteApp(C2.app);

    const docAdmin = (await getDoc(doc(A.db, 'clientes', uid))).data();
    assert.equal(docAdmin.status, 'bloqueado');
    assert.ok(docAdmin.bloqueadoEm);
  });

  await t.test('desbloqueio devolve tudo como estava', async () => {
    await A.chamar('adminDesbloquearCliente', { uid });
    const C3 = novoApp();
    await signInWithEmailAndPassword(C3.auth, 'ana@cliente.test', senhaProvisoria);
    const dna = await getDoc(doc(C3.db, 'clientes', uid, 'dna', 'atual'));
    assert.equal(dna.data().temaPrincipal, 'confeitaria');
    assert.equal((await C3.chamar('clienteVerificarAcesso', {})).ok, true);
    await deleteApp(C3.app);
  });

  await t.test('vencimento passado bloqueia na primeira chamada', async () => {
    await A.chamar('adminAtualizarCliente', { uid, venceEm: '2020-01-01' });
    const C4 = novoApp();
    await signInWithEmailAndPassword(C4.auth, 'ana@cliente.test', senhaProvisoria);
    await negado(C4.chamar('clienteVerificarAcesso', {}));
    assert.equal((await getDoc(doc(A.db, 'clientes', uid))).data().status, 'bloqueado');
    await negado(A.chamar('adminDesbloquearCliente', { uid }), 'failed-precondition');
    await A.chamar('adminAtualizarCliente', { uid, venceEm: null });
    await A.chamar('adminDesbloquearCliente', { uid });
    await deleteApp(C4.app);
  });

  await t.test('admin lê subcoleções de clientes', async () => {
    const dna = await getDoc(doc(A.db, 'clientes', uid, 'dna', 'atual'));
    assert.equal(dna.data().temaPrincipal, 'confeitaria');
  });

  await t.test('admin marcado por documento admins/{uid} (Console)', async () => {
    const u = await admin.auth().createUser({ email: 'console@visions.test', password: 'senha-console-1' });
    const D = novoApp();
    await signInWithEmailAndPassword(D.auth, 'console@visions.test', 'senha-console-1');
    // Sem o documento: não é admin.
    await negado(D.chamar('adminBloquearCliente', { uid }));
    await negado(getDoc(doc(D.db, 'clientes', uid)));
    // Ninguém consegue se marcar como admin pelo app.
    await negado(setDoc(doc(D.db, 'admins', u.uid), { nome: 'eu' }));
    // Marcado pelo Console (Admin SDK simula isso).
    await admin.firestore().doc(`admins/${u.uid}`).set({ email: 'console@visions.test' });
    assert.ok((await getDoc(doc(D.db, 'admins', u.uid))).exists());
    assert.equal((await getDoc(doc(D.db, 'clientes', uid))).data().nome, 'Ana Teste');
    await D.chamar('adminAtualizarCliente', { uid, limiteGeracoesMes: 40 });
    // Cliente não lê o documento de admin de outra pessoa.
    await negado(getDoc(doc(C.db, 'admins', u.uid)));
    await deleteApp(D.app);
  });

  await deleteApp(C.app);
  await deleteApp(A.app);
});
