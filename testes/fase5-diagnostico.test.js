// Aceite da Fase 5: postado, métricas e diagnóstico (IA simulada).
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, updateDoc, collection, getDocs } = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const admin = require('firebase-admin');

const PROJETO = 'visionscontent-cba52';
if (!admin.apps.length) admin.initializeApp({ projectId: PROJETO });
const adb = admin.firestore();
let n = 0;
function novoApp() {
  const app = initializeApp({ apiKey: 'fake', projectId: PROJETO, authDomain: `${PROJETO}.firebaseapp.com` }, `f5${n++}`);
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
const REELS = { formato: 'reels', pilar: 'P1', estilo: 'analise', angulo: 'erro_comum', tema: 'bolo que murcha', framework: 'AIDA', formatoVisual: 'talking_head', cta: 'enviar', estiloLegenda: 'explicativa' };

test('postado, métricas e diagnóstico', async (t) => {
  const u = await admin.auth().createUser({ email: 'f5@cliente.test', password: 'senha-teste-1' });
  await adb.doc(`clientes/${u.uid}`).set({ nome: 'F5', email: 'f5@cliente.test', status: 'ativo', venceEm: null, limiteGeracoesMes: null, geracoesNoMes: 0, mesReferencia: '2026-11' });
  await adb.doc(`clientes/${u.uid}/dna/atual`).set(DNA);
  const C = novoApp();
  await signInWithEmailAndPassword(C.auth, 'f5@cliente.test', 'senha-teste-1');
  const { id } = await C.chamar('gerarRoteiro', REELS);
  let postId;

  await t.test('marcar como postado cria o post e agenda 2 lembretes', async () => {
    await negado(C.chamar('marcarPostado', { roteiroId: id, linkPost: 'https://exemplo.com/x' }), 'invalid-argument');
    await negado(C.chamar('marcarPostado', { roteiroId: id, postadoEm: '2099-01-01T10:00:00Z' }), 'invalid-argument');
    const r = await C.chamar('marcarPostado', { roteiroId: id, linkPost: 'https://www.instagram.com/reel/abc/', ganchosTestados: [1, 2, 3, 9] });
    postId = r.postId;
    const post = (await getDoc(doc(C.db, 'clientes', u.uid, 'posts', postId))).data();
    assert.deepEqual(post.ganchosTestados.map((g) => g.n), [1, 2, 3]);
    assert.equal(post.lembretes.length, 2);
    const h48 = post.lembretes[0].em.toMillis() - post.postadoEm.toMillis();
    assert.equal(h48, 48 * 3600 * 1000);
    const fila = await adb.collection('lembretes').where('postId', '==', postId).get();
    assert.equal(fila.size, 2);
    assert.equal((await getDoc(doc(C.db, 'clientes', u.uid, 'roteiros', id))).data().status, 'postado');
    await negado(C.chamar('marcarPostado', { roteiroId: id }), 'failed-precondition');
  });

  await t.test('cliente não escreve no post nem na fila de lembretes', async () => {
    await negado(updateDoc(doc(C.db, 'clientes', u.uid, 'posts', postId), { metricas: { alcance: 1 } }));
    await negado(getDocs(collection(C.db, 'lembretes')));
  });

  await t.test('métricas obrigatórias e valores inválidos', async () => {
    await negado(C.chamar('salvarMetricas', { postId, metricas: { alcance: 1000 } }), 'invalid-argument');
    await negado(C.chamar('salvarMetricas', { postId, metricas: { alcance: 1000, retencao3s: 140, tempoMedioSeg: 10, duracaoSeg: 50 } }), 'invalid-argument');
    await negado(C.chamar('salvarMetricas', { postId, metricas: { alcance: -5, retencao3s: 40, tempoMedioSeg: 10, duracaoSeg: 50 } }), 'invalid-argument');
  });

  await t.test('diagnóstico com referência inicial, gancho vencedor e trava', async () => {
    await C.chamar('salvarMetricas', { postId, metricas: {
      alcance: 1200, visualizacoes: 1500, retencao3s: 18, tempoMedioSeg: 12, duracaoSeg: 48, curtidas: 40, comentarios: 3, compartilhamentos: 4, salvamentos: 6, segundoQueda: 9,
      variantes: [{ n: 1, visualizacoes: 600, retencao3s: 18 }, { n: 2, visualizacoes: 900, retencao3s: 34 }, { n: 3, visualizacoes: 300, retencao3s: 12 }],
    } });
    const post = (await getDoc(doc(C.db, 'clientes', u.uid, 'posts', postId))).data();
    const d = post.diagnostico;
    assert.match(d.comparadoCom, /referência inicial/);
    assert.ok(d.achados.some((a) => a.regra === 'gancho_nao_segurou' && a.severidade === 'alta'));
    assert.equal(d.ganchoVencedor.n, 2);
    assert.equal(d.ajustesProximo.length, 3);
    assert.doesNotMatch(d.explicacao, /[—–]/, 'travessão corrigido pela trava');
    assert.ok(post.taxas.taxaCompart > 0);
    assert.equal((await getDoc(doc(C.db, 'clientes', u.uid, 'roteiros', id))).data().status, 'medido');
    assert.equal((await adb.collection('lembretes').where('postId', '==', postId).get()).size, 0, 'lembretes pendentes removidos');
    const notifs = await getDocs(collection(C.db, 'clientes', u.uid, 'notificacoes'));
    assert.ok(notifs.docs.some((x) => x.data().tipo === 'diagnostico_pronto'));
  });

  await t.test('stories: 1 lembrete em 20h e diagnóstico por frame', async () => {
    const st = await C.chamar('gerarRoteiro', { formato: 'sequencia_stories', pilar: 'P3', estilo: 'bastidor', angulo: 'historia_pessoal', tema: 'sábado de produção', framework: 'AIDA', cta: 'enquete' });
    const { postId: pid } = await C.chamar('marcarPostado', { roteiroId: st.id });
    const p = (await getDoc(doc(C.db, 'clientes', u.uid, 'posts', pid))).data();
    assert.equal(p.lembretes.length, 1);
    assert.equal(p.lembretes[0].em.toMillis() - p.postadoEm.toMillis(), 20 * 3600 * 1000);
    await C.chamar('salvarMetricas', { postId: pid, metricas: { frames: [{ alcance: 500 }, { alcance: 300 }, { alcance: 80 }, { alcance: 40 }] } });
    const d = (await getDoc(doc(C.db, 'clientes', u.uid, 'posts', pid))).data().diagnostico;
    assert.ok(d.achados.some((a) => a.regra === 'stories_queda' && /frame 2/.test(a.mensagem)));
    assert.ok(d.achados.some((a) => a.regra === 'stories_sem_interacao'));
  });

  await t.test('o diagnóstico entra como aprendizado no próximo roteiro', async () => {
    const snap = await adb.collection(`clientes/${u.uid}/posts`).orderBy('metricasPreenchidasEm', 'desc').limit(30).get();
    assert.ok(snap.docs.some((d) => d.data().diagnostico?.ajustesProximo?.length === 3));
    const { id: novo } = await C.chamar('gerarRoteiro', REELS);
    const r = (await getDoc(doc(C.db, 'clientes', u.uid, 'roteiros', novo))).data();
    assert.match(r.conteudo.notaProducao, /com aprendizado dos posts anteriores/);
  });

  await deleteApp(C.app);
});
