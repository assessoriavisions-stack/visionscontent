// Aceite da Fase 8: editor da trava, teste ao vivo, benchmarks e uso por mês.
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc } = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const admin = require('firebase-admin');
const { padroesBase } = require('../functions/config/seedPadrao');

const PROJETO = 'visionscontent-cba52';
if (!admin.apps.length) admin.initializeApp({ projectId: PROJETO });
const adb = admin.firestore();
let n = 0;
function novoApp() {
  const app = initializeApp({ apiKey: 'fake', projectId: PROJETO, authDomain: `${PROJETO}.firebaseapp.com` }, `f8${n++}`);
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

test('admin avançado', async (t) => {
  const adm = await admin.auth().createUser({ email: 'f8-admin@visions.test', password: 'senha-admin-1' });
  await adb.doc(`admins/${adm.uid}`).set({ email: 'f8-admin@visions.test' });
  const A = novoApp();
  await signInWithEmailAndPassword(A.auth, 'f8-admin@visions.test', 'senha-admin-1');
  const u = await admin.auth().createUser({ email: 'f8@cliente.test', password: 'senha-teste-1' });
  await adb.doc(`clientes/${u.uid}`).set({ nome: 'F8', email: 'f8@cliente.test', status: 'ativo', venceEm: null, limiteGeracoesMes: null, geracoesNoMes: 0, mesReferencia: '2026-11' });
  await adb.doc(`clientes/${u.uid}/dna/atual`).set(DNA);
  const C = novoApp();
  await signInWithEmailAndPassword(C.auth, 'f8@cliente.test', 'senha-teste-1');
  const base = padroesBase.map((p) => ({ ...p }));

  await t.test('cliente não usa as funções de admin', async () => {
    await negado(C.chamar('adminAtualizarTrava', { padroesBase: base }));
    await negado(C.chamar('adminTestarTrava', { padroesBase: base, texto: 'x' }));
    await negado(C.chamar('adminAtualizarBenchmarks', {}));
  });

  await t.test('regex inválida, id repetido e heurística desconhecida são barrados', async () => {
    await negado(A.chamar('adminAtualizarTrava', { padroesBase: [...base, { id: 'quebrada', tipo: 'regex', valor: '(sem fechar', ativo: true }] }), 'invalid-argument');
    await negado(A.chamar('adminAtualizarTrava', { padroesBase: [...base, { id: 'vazia', tipo: 'regex', valor: 'a*', ativo: true }] }), 'invalid-argument');
    await negado(A.chamar('adminAtualizarTrava', { padroesBase: [...base, { ...base[0] }] }), 'invalid-argument');
    await negado(A.chamar('adminAtualizarTrava', { padroesBase: [...base, { id: 'nova_h', tipo: 'heuristica', valor: 'inventada', ativo: true }] }), 'invalid-argument');
  });

  await t.test('teste ao vivo usa a trava de verdade', async () => {
    const r = await A.chamar('adminTestarTrava', { padroesBase: base, texto: 'Isso não é sobre preço, é sobre tempo — e a jornada.' });
    const ids = r.violacoes.map((v) => v.padraoId).sort();
    assert.deepEqual(ids, ['contraste_nao_e', 'jornada', 'travessao']);
  });

  await t.test('padrão novo salvo passa a valer na geração', async () => {
    await A.chamar('adminAtualizarTrava', { padroesBase: [...base, { id: 'termometro', tipo: 'termo', valor: 'termômetro', descricao: 'teste', ativo: true }] });
    const salvo = (await adb.doc('config/travaAntiIA').get()).data();
    assert.ok(salvo.padroesBase.some((p) => p.id === 'termometro'));
    assert.equal(salvo.atualizadoPor, adm.uid);
    const { id } = await C.chamar('gerarRoteiro', { formato: 'reels', pilar: 'P3', estilo: 'opiniao', angulo: 'duvida_comum', tema: 'forno', framework: 'AIDA', formatoVisual: 'talking_head', cta: 'comentar', estiloLegenda: 'pergunta' });
    const r = (await getDoc(doc(C.db, 'clientes', u.uid, 'roteiros', id))).data();
    assert.ok(r.trava.pendentes.some((p) => p.padraoId === 'termometro'));
    await A.chamar('adminAtualizarTrava', { padroesBase: base }); // volta ao normal
  });

  await t.test('benchmarks: validação e gravação', async () => {
    const ok = { reels: { retencao3s: 0.35, tempoMedioSobreDuracao: 0.4, taxaCompart: 0.01, taxaSalv: 0.01, taxaComent: 0.005 }, carrossel: { taxaCompart: 0.01, taxaSalv: 0.02, taxaComent: 0.005 }, postUnico: { taxaCompart: 0.005, taxaSalv: 0.01, taxaComent: 0.005 }, stories: { retencaoSequencia: 0.1, taxaResposta: 0.01 } };
    await negado(A.chamar('adminAtualizarBenchmarks', { ...ok, reels: { ...ok.reels, retencao3s: 35 } }), 'invalid-argument');
    await A.chamar('adminAtualizarBenchmarks', ok);
    assert.equal((await adb.doc('config/benchmarks').get()).data().reels.retencao3s, 0.35);
  });

  await t.test('uso por mês fica guardado', async () => {
    const cli = (await adb.doc(`clientes/${u.uid}`).get()).data();
    const mes = Object.keys(cli.geracoesPorMes || {})[0];
    assert.match(mes, /^\d{4}-\d{2}$/);
    assert.equal(cli.geracoesPorMes[mes], 1);
  });

  await t.test('admin lê os logs da trava; cliente não', async () => {
    const { collection, getDocs, query, limit } = require('firebase/firestore');
    const logs = await getDocs(query(collection(A.db, 'logs', 'trava', 'registros'), limit(5)));
    assert.ok(logs.size > 0);
    await negado(getDocs(query(collection(C.db, 'logs', 'trava', 'registros'), limit(5))));
  });

  await deleteApp(C.app);
  await deleteApp(A.app);
});
