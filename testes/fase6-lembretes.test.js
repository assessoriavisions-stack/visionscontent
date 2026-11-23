// Aceite da Fase 6: fila de lembretes, notificações e tokens de push.
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, updateDoc, collection, getDocs, arrayUnion } = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const admin = require('firebase-admin');

const PROJETO = 'visionscontent-cba52';
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || PROJETO;
if (!admin.apps.length) admin.initializeApp({ projectId: PROJETO });
const adb = admin.firestore();
// A rotina roda aqui mesmo (mesmo código da function agendada), contra o emulador.
const { processarLembretes } = require('../functions/lembretes');
const { Timestamp: TS } = require('../functions/lib/firebase');

let n = 0;
function novoApp() {
  const app = initializeApp({ apiKey: 'fake', projectId: PROJETO, authDomain: `${PROJETO}.firebaseapp.com` }, `f6${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fns = getFunctions(app, 'southamerica-east1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  return { app, auth, db, chamar: (nome, dados) => httpsCallable(fns, nome, { timeout: 120000 })(dados).then((r) => r.data) };
}
const negado = (p, codigo = 'permission-denied') =>
  assert.rejects(p, (e) => { assert.match(String(e.code), new RegExp(codigo)); return true; });

const DNA = {
  negocio: { oQueFaz: 'Bolos de pote', paraQuem: 'Mães', destinoVenda: 'whatsapp' }, produtos: [{ nome: 'Kit festa' }],
  tom: { eixos: { tecnicoProximo: 4, serioIrreverente: 3, formalInformal: 5, calmoIntenso: 2 }, exemplosReais: ['x'.repeat(60), 'y'.repeat(60), 'z'.repeat(60)], perfilDeVozExtraido: 'Ritmo: rápido.' },
  temaPrincipal: 'Confeitaria', subtemas: ['forno'], onboardingConcluido: true,
};

test('lembretes', async (t) => {
  const u = await admin.auth().createUser({ email: 'f6@cliente.test', password: 'senha-teste-1' });
  await adb.doc(`clientes/${u.uid}`).set({ nome: 'F6', email: 'f6@cliente.test', status: 'ativo', venceEm: null, limiteGeracoesMes: null, geracoesNoMes: 0, mesReferencia: '2026-11', fcmTokens: [] });
  await adb.doc(`clientes/${u.uid}/dna/atual`).set(DNA);
  const C = novoApp();
  await signInWithEmailAndPassword(C.auth, 'f6@cliente.test', 'senha-teste-1');

  await t.test('cliente registra o token de push (só fcmTokens)', async () => {
    await updateDoc(doc(C.db, 'clientes', u.uid), { fcmTokens: arrayUnion('token-bom', 'token-velho') });
    assert.deepEqual((await getDoc(doc(C.db, 'clientes', u.uid))).data().fcmTokens, ['token-bom', 'token-velho']);
  });

  const { id } = await C.chamar('gerarRoteiro', { formato: 'reels', pilar: 'P3', estilo: 'opiniao', angulo: 'duvida_comum', tema: 'bolo caro', framework: 'AIDA', formatoVisual: 'talking_head', cta: 'comentar', estiloLegenda: 'pergunta' });
  const { postId } = await C.chamar('marcarPostado', { roteiroId: id });

  await t.test('antes da hora, nada sai', async () => {
    const envios = [];
    const r = await processarLembretes({ enviarPush: async (tk, d) => { envios.push(d); return []; } });
    assert.equal(r.enviados, 0);
    assert.equal(envios.length, 0);
  });

  await t.test('lembrete de 48h: notificação, push, token inválido removido', async () => {
    const envios = [];
    const daqui49h = TS.fromMillis(Date.now() + 49 * 3600 * 1000);
    await processarLembretes({ agora: daqui49h, enviarPush: async (tokens, dados) => { if (dados.postId === postId) envios.push({ tokens, dados }); return tokens.includes('token-velho') ? ['token-velho'] : []; } });
    assert.equal(envios.length, 1);
    assert.deepEqual(envios[0].tokens.sort(), ['token-bom', 'token-velho']);
    assert.match(envios[0].dados.texto, /^Como foi o post de \d{2}\/\d{2}\? Leva 1 minuto preencher e eu te digo o que ajustar no próximo\.$/);
    assert.equal(envios[0].dados.postId, postId);
    const notifs = await getDocs(collection(C.db, 'clientes', u.uid, 'notificacoes'));
    assert.ok(notifs.docs.some((d) => d.data().tipo === 'lembrete_metricas' && d.data().postId === postId && d.data().lida === false));
    assert.deepEqual((await getDoc(doc(C.db, 'clientes', u.uid))).data().fcmTokens, ['token-bom']);
    const post = (await getDoc(doc(C.db, 'clientes', u.uid, 'posts', postId))).data();
    assert.deepEqual(post.lembretes.map((l) => l.enviado), [true, false]);
    assert.equal((await adb.collection('lembretes').where('postId', '==', postId).get()).size, 1, 'o de 7 dias continua na fila');
  });

  await t.test('cliente marca a notificação como lida, e só isso', async () => {
    const notifs = await getDocs(collection(C.db, 'clientes', u.uid, 'notificacoes'));
    const ref = notifs.docs[0].ref;
    await updateDoc(doc(C.db, ref.path), { lida: true });
    await negado(updateDoc(doc(C.db, ref.path), { texto: 'outro' }));
  });

  await t.test('cliente bloqueado não recebe; lembrete sai da fila', async () => {
    await adb.doc(`clientes/${u.uid}`).update({ status: 'bloqueado' });
    const envios = [];
    const r = await processarLembretes({ agora: TS.fromMillis(Date.now() + 8 * 24 * 3600 * 1000), enviarPush: async (tk, d) => { if (d.postId === postId) envios.push(d); return []; } });
    assert.equal(envios.length, 0);
    assert.ok(r.pulados >= 1);
    assert.equal((await adb.collection('lembretes').where('postId', '==', postId).get()).size, 0);
    await adb.doc(`clientes/${u.uid}`).update({ status: 'ativo' });
  });

  await deleteApp(C.app);
});
