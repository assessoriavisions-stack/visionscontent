// Aceite da Fase 7: campanha, cronograma e roteiro a partir do cronograma.
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, updateDoc, addDoc, collection } = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const admin = require('firebase-admin');

const PROJETO = 'visionscontent-cba52';
if (!admin.apps.length) admin.initializeApp({ projectId: PROJETO });
const adb = admin.firestore();
let n = 0;
function novoApp() {
  const app = initializeApp({ apiKey: 'fake', projectId: PROJETO, authDomain: `${PROJETO}.firebaseapp.com` }, `f7${n++}`);
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
const CAMPANHA = { nome: 'Natal sem estresse', objetivo: 'Vender 40 kits', oferta: 'Frete grátis', mecanica: 'Até dia 10 ganha 5 potes extras', dataInicio: '2026-12-01', dataLimite: '2026-12-20', quantidadePosts: 10, formatosPermitidos: ['reels', 'carrossel', 'sequencia_stories'] };

test('campanhas', async (t) => {
  const u = await admin.auth().createUser({ email: 'f7@cliente.test', password: 'senha-teste-1' });
  await adb.doc(`clientes/${u.uid}`).set({ nome: 'F7', email: 'f7@cliente.test', status: 'ativo', venceEm: null, limiteGeracoesMes: null, geracoesNoMes: 0, mesReferencia: '2026-11' });
  await adb.doc(`clientes/${u.uid}/dna/atual`).set(DNA);
  const C = novoApp();
  await signInWithEmailAndPassword(C.auth, 'f7@cliente.test', 'senha-teste-1');
  let campanhaId;
  const lerC = async () => (await getDoc(doc(C.db, 'clientes', u.uid, 'campanhas', campanhaId))).data();

  await t.test('validações de entrada', async () => {
    await negado(C.chamar('gerarCronogramaCampanha', { ...CAMPANHA, quantidadePosts: 2 }), 'invalid-argument');
    await negado(C.chamar('gerarCronogramaCampanha', { ...CAMPANHA, dataLimite: '2026-11-01' }), 'invalid-argument');
    await negado(C.chamar('gerarCronogramaCampanha', { ...CAMPANHA, formatosPermitidos: [] }), 'invalid-argument');
    await negado(addDoc(collection(C.db, 'clientes', u.uid, 'campanhas'), { nome: 'direto' }));
  });

  await t.test('cronograma com fases, temas e trava', async () => {
    campanhaId = (await C.chamar('gerarCronogramaCampanha', CAMPANHA)).id;
    const c = await lerC();
    assert.equal(c.posts.length, 10);
    assert.deepEqual(c.fases.map((f) => f.id), ['aquecimento', 'conversao', 'ultima_chamada']);
    assert.ok(c.posts.every((p) => p.temaProposto && p.porQue && p.status === 'ideia'));
    assert.doesNotMatch(c.posts[0].porQue, /[—–]/, 'travessão corrigido');
    assert.equal((await adb.doc(`clientes/${u.uid}`).get()).data().geracoesNoMes, 1);
  });

  await t.test('arrastar muda a data (cliente atualiza só os posts)', async () => {
    const c = await lerC();
    const posts = c.posts.map((p) => (p.ordem === 2 ? { ...p, data: '2026-12-05' } : p));
    await updateDoc(doc(C.db, 'clientes', u.uid, 'campanhas', campanhaId), { posts });
    assert.equal((await lerC()).posts[1].data, '2026-12-05');
  });

  let roteiroId;
  await t.test('criar roteiro a partir do cronograma leva o contexto da campanha', async () => {
    const p = (await lerC()).posts.find((x) => x.fase === 'conversao' && x.formato === 'reels') || (await lerC()).posts.find((x) => x.fase === 'conversao');
    const dados = { formato: p.formato, pilar: p.pilar, estilo: p.estilo, angulo: p.angulo, tema: p.temaProposto, framework: 'ADP', formatoVisual: ['reels', 'serie'].includes(p.formato) ? 'vlog' : null, cta: p.formato.includes('stor') ? 'enquete' : 'link_bio', estiloLegenda: p.formato.includes('stor') ? null : 'storytelling', campanhaId, campanhaOrdem: p.ordem };
    roteiroId = (await C.chamar('gerarRoteiro', dados)).id;
    const r = (await getDoc(doc(C.db, 'clientes', u.uid, 'roteiros', roteiroId))).data();
    assert.equal(r.campanhaId, campanhaId);
    assert.equal(r.campanhaOrdem, p.ordem);
    if (r.conteudo.bigIdea) assert.match(r.conteudo.bigIdea, /Campanha: Natal sem estresse/);
    const pc = (await lerC()).posts.find((x) => x.ordem === p.ordem);
    assert.equal(pc.roteiroId, roteiroId);
    assert.equal(pc.status, 'roteiro');
    await negado(C.chamar('gerarRoteiro', dados), 'failed-precondition');
  });

  await t.test('status acompanha: postado e medido', async () => {
    const { postId } = await C.chamar('marcarPostado', { roteiroId });
    assert.equal((await lerC()).posts.find((x) => x.roteiroId === roteiroId).status, 'postado');
    const post = (await getDoc(doc(C.db, 'clientes', u.uid, 'posts', postId))).data();
    const metricas = ['reels', 'serie'].includes(post.formato)
      ? { alcance: 800, retencao3s: 40, tempoMedioSeg: 20, duracaoSeg: 50, mensagens: 3 }
      : post.formato.includes('stor') ? { frames: [{ alcance: 300 }, { alcance: 200 }] } : { alcance: 800, mensagens: 3 };
    await C.chamar('salvarMetricas', { postId, metricas });
    assert.equal((await lerC()).posts.find((x) => x.roteiroId === roteiroId).status, 'medido');
  });

  await deleteApp(C.app);
});
