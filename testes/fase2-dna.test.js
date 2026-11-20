// Aceite da Fase 2: DNA do perfil e extração do perfil de voz (IA simulada nos emuladores).
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc } = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const admin = require('firebase-admin');

const PROJETO = 'visionscontent-cba52';
if (!admin.apps.length) admin.initializeApp({ projectId: PROJETO });

let n = 0;
function novoApp() {
  const app = initializeApp({ apiKey: 'fake', projectId: PROJETO, authDomain: `${PROJETO}.firebaseapp.com` }, `dna${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fns = getFunctions(app, 'southamerica-east1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  return { app, auth, db, chamar: (nome, dados) => httpsCallable(fns, nome)(dados).then((r) => r.data) };
}
const negado = (p, codigo = 'permission-denied') =>
  assert.rejects(p, (e) => { assert.match(String(e.code), new RegExp(codigo)); return true; });

test('DNA do perfil', async (t) => {
  const u = await admin.auth().createUser({ email: 'carla@cliente.test', password: 'senha-carla-1' });
  await admin.firestore().doc(`clientes/${u.uid}`).set({ nome: 'Carla', email: 'carla@cliente.test', status: 'ativo', venceEm: null, limiteGeracoesMes: null, geracoesNoMes: 0, mesReferencia: '2026-11' });
  const C = novoApp();
  await signInWithEmailAndPassword(C.auth, 'carla@cliente.test', 'senha-carla-1');
  const ref = doc(C.db, 'clientes', u.uid, 'dna', 'atual');

  await t.test('perfil de voz exige 3 exemplos', async () => {
    await setDoc(ref, { negocio: { oQueFaz: 'Bolos', paraQuem: 'Mães', destinoVenda: 'whatsapp' }, etapaOnboarding: 1 }, { merge: true });
    await negado(C.chamar('extrairPerfilDeVoz', {}), 'failed-precondition');
  });

  await t.test('regras limitam o que o cliente grava no DNA', async () => {
    await negado(setDoc(ref, { campoEstranho: 1 }, { merge: true }));
    await negado(setDoc(ref, { tom: { exemplosReais: ['a', 'b', 'c', 'd', 'e', 'f'] } }, { merge: true }));
    await negado(setDoc(doc(C.db, 'clientes', u.uid, 'dna', 'outro'), { temaPrincipal: 'x' }));
  });

  await t.test('extrai o perfil de voz e a trava corrige o travessão', async () => {
    await setDoc(ref, {
      tom: {
        eixos: { tecnicoProximo: 4, serioIrreverente: 3, formalInformal: 5, calmoIntenso: 2 },
        exemplosReais: [
          'Gente, hoje saiu fornada dupla porque a encomenda de sábado chegou mais cedo! Quem pediu já pode separar o pote.',
          'Olha só o recheio novo de ninho com morango que eu testei essa semana. Ficou cremoso e não escorre no pote.',
          'Ontem uma cliente me perguntou por que meu bolo não murcha. O segredo é deixar a massa descansar na geladeira.',
        ],
      },
      expressoesQueUsa: ['gente', 'olha só'],
    }, { merge: true });
    const r = await C.chamar('extrairPerfilDeVoz', {});
    assert.match(r.perfilDeVoz, /^Ritmo:/);
    assert.doesNotMatch(r.perfilDeVoz, /[—–]/);
    assert.deepEqual(r.pendencias, []);
    const salvo = (await getDoc(ref)).data();
    assert.equal(salvo.tom.perfilDeVozExtraido, r.perfilDeVoz);
    assert.equal(salvo.tom.exemplosReais.length, 3, 'merge não apaga os exemplos');

    const logs = await admin.firestore().collection('logs/trava/registros').where('uid', '==', u.uid).get();
    assert.ok(logs.docs.some((d) => d.data().padraoId === 'travessao' && d.data().resolvido === true));
    await negado(getDoc(doc(C.db, 'logs', 'trava', 'registros', logs.docs[0].id)));
  });

  await t.test('cliente bloqueado não extrai perfil', async () => {
    await admin.firestore().doc(`clientes/${u.uid}`).update({ status: 'bloqueado' });
    await negado(C.chamar('extrairPerfilDeVoz', {}));
    await negado(getDoc(ref));
  });

  await deleteApp(C.app);
});
