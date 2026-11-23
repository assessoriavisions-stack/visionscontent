// Aceite da Fase 4: editor (editar, regerar bloco, versões).
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, updateDoc, deleteDoc, Timestamp } = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const admin = require('firebase-admin');

const PROJETO = 'visionscontent-cba52';
if (!admin.apps.length) admin.initializeApp({ projectId: PROJETO });
const adb = admin.firestore();
let n = 0;
function novoApp() {
  const app = initializeApp({ apiKey: 'fake', projectId: PROJETO, authDomain: `${PROJETO}.firebaseapp.com` }, `ed${n++}`);
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
const BASE = { formato: 'reels', pilar: 'P1', estilo: 'analise', angulo: 'erro_comum', tema: 'bolo que murcha', framework: 'AIDA', formatoVisual: 'talking_head', cta: 'enviar', estiloLegenda: 'explicativa' };

test('editor de roteiro', async (t) => {
  const u = await admin.auth().createUser({ email: 'editor@cliente.test', password: 'senha-teste-1' });
  await adb.doc(`clientes/${u.uid}`).set({ nome: 'Ed', email: 'editor@cliente.test', status: 'ativo', venceEm: null, limiteGeracoesMes: null, geracoesNoMes: 0, mesReferencia: '2026-11' });
  await adb.doc(`clientes/${u.uid}/dna/atual`).set(DNA);
  const C = novoApp();
  await signInWithEmailAndPassword(C.auth, 'editor@cliente.test', 'senha-teste-1');
  const { id } = await C.chamar('gerarRoteiro', BASE);
  const ref = doc(C.db, 'clientes', u.uid, 'roteiros', id);
  const ler = async () => (await getDoc(ref)).data();

  await t.test('versão inicial guarda as marcas da trava', async () => {
    const r = await ler();
    assert.equal(r.versoes.length, 1);
    assert.deepEqual(r.versoes[0].pendentes.map((p) => p.padraoId), ['jornada']);
  });

  await t.test('cliente edita o texto e salva versão própria', async () => {
    const r = await ler();
    const conteudo = { ...r.conteudo, blocos: r.conteudo.blocos.map((b, i) => (i === 1 ? { ...b, fala: 'Meu forno marcava 180 e estava em 210, fiquei chocada.' } : b)) };
    await updateDoc(ref, { conteudo, versoes: [...r.versoes, { conteudo, legenda: r.legenda, editadoPor: 'cliente', em: Timestamp.now() }], status: 'pronto' });
    const d = await ler();
    assert.equal(d.status, 'pronto');
    assert.equal(d.versoes.length, 2);
  });

  await t.test('regerar um bloco: muda só ele e passa pela trava', async () => {
    const antes = await ler();
    await C.chamar('regerarBloco', { roteiroId: id, alvo: 'blocos.2', pedido: 'mais direto' });
    const r = await ler();
    assert.equal(r.conteudo.blocos[2].fala, 'Meça o forno antes de cada fornada, com um termômetro de vinte reais.');
    assert.equal(r.conteudo.blocos[2].tipo, 'conteudo');
    assert.equal(r.conteudo.blocos[1].fala, antes.conteudo.blocos[1].fala, 'o resto fica igual');
    assert.equal(r.versoes.length, 3);
    assert.equal(r.versoes[2].alvo, 'blocos.2');
    assert.ok(r.trava.violacoesEncontradas.some((v) => v.padraoId === 'e_essencial' && v.campo === 'blocos.2.fala'));
    // A marca da legenda continua (texto não mudou).
    assert.ok(r.trava.pendentes.some((p) => p.padraoId === 'jornada' && p.campo === 'legenda'));
  });

  await t.test('regerar a legenda tira a marca antiga', async () => {
    await C.chamar('regerarBloco', { roteiroId: id, alvo: 'legenda' });
    const r = await ler();
    assert.match(r.legenda, /Testei três sextas/);
    assert.deepEqual(r.trava.pendentes, []);
    assert.equal(r.trava.passou, true);
  });

  await t.test('regerar o gancho 1 atualiza a abertura do roteiro', async () => {
    await C.chamar('regerarBloco', { roteiroId: id, alvo: 'ganchos.0' });
    const r = await ler();
    assert.equal(r.conteudo.ganchos[0].texto, 'Meu forno marcava 180 e estava em 210.');
    assert.equal(r.conteudo.blocos[0].fala, 'Meu forno marcava 180 e estava em 210.');
  });

  await t.test('histórico fica nas últimas 10 versões', async () => {
    for (let i = 0; i < 8; i++) await C.chamar('regerarBloco', { roteiroId: id, alvo: 'blocos.3' });
    const r = await ler();
    assert.equal(r.versoes.length, 10);
    await negado(updateDoc(ref, { versoes: [...r.versoes, r.versoes[0]] }));
  });

  await t.test('alvo inválido e roteiro de outra pessoa', async () => {
    await negado(C.chamar('regerarBloco', { roteiroId: id, alvo: 'blocos.40' }), 'invalid-argument');
    await negado(C.chamar('regerarBloco', { roteiroId: id, alvo: 'bigIdea' }), 'invalid-argument');
    await negado(C.chamar('regerarBloco', { roteiroId: 'nao-existe', alvo: 'legenda' }), 'not-found');
  });

  await t.test('roteiro postado não muda mais', async () => {
    await adb.doc(`clientes/${u.uid}/roteiros/${id}`).update({ status: 'postado' });
    await negado(C.chamar('regerarBloco', { roteiroId: id, alvo: 'legenda' }), 'failed-precondition');
    await negado(updateDoc(ref, { legenda: 'mudei' }));
    await negado(deleteDoc(ref));
  });

  await deleteApp(C.app);
});
