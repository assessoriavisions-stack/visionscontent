// Estratégia do cliente (admin), produtos e foco do mês.
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc } = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const admin = require('firebase-admin');

const PROJETO = 'visionscontent-cba52';
if (!admin.apps.length) admin.initializeApp({ projectId: PROJETO });
const adb = admin.firestore();
const MES = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date());

let n = 0;
function novoApp() {
  const app = initializeApp({ apiKey: 'fake', projectId: PROJETO, authDomain: `${PROJETO}.firebaseapp.com` }, `est${n++}`);
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
  negocio: { oQueFaz: 'Bolos de pote', paraQuem: 'Mães', destinoVenda: 'whatsapp' },
  tom: { eixos: { tecnicoProximo: 4, serioIrreverente: 3, formalInformal: 5, calmoIntenso: 2 }, exemplosReais: ['x'.repeat(60), 'y'.repeat(60), 'z'.repeat(60)], perfilDeVozExtraido: 'Ritmo: rápido.' },
  temaPrincipal: 'Confeitaria', subtemas: ['forno'], onboardingConcluido: true,
};
const PLANO = 'Plano de ação da Ana Confeitaria. '.repeat(20);

test('estratégia, produtos e foco do mês', async (t) => {
  const adm = await admin.auth().createUser({ email: 'leo-est@visions.test', password: 'senha-admin-1' });
  await adb.doc(`admins/${adm.uid}`).set({ email: 'leo-est@visions.test' });
  const A = novoApp();
  await signInWithEmailAndPassword(A.auth, 'leo-est@visions.test', 'senha-admin-1');

  const u = await admin.auth().createUser({ email: 'est@cliente.test', password: 'senha-cli-1' });
  await adb.doc(`clientes/${u.uid}`).set({ nome: 'Ana', email: 'est@cliente.test', status: 'ativo', venceEm: null, limiteGeracoesMes: null, geracoesNoMes: 0, mesReferencia: MES, crescimento: { fase: 'testes', vencedor: null } });
  await adb.doc(`clientes/${u.uid}/dna/atual`).set(DNA);
  const C = novoApp();
  await signInWithEmailAndPassword(C.auth, 'est@cliente.test', 'senha-cli-1');
  const base = { formato: 'reels', pilar: 'P2', estilo: 'prova_social', angulo: 'maior_desejo', tema: 'kit festa', framework: 'ADP', formatoVisual: 'vlog', cta: 'link_bio', estiloLegenda: 'storytelling' };

  await t.test('sem produto cadastrado o DNA fica incompleto', async () => {
    await negado(C.chamar('gerarRoteiro', base), 'failed-precondition');
    await setDoc(doc(C.db, 'clientes', u.uid, 'dna', 'atual'), { produtos: [{ nome: 'Kit festa 30 potes', preco: 'R$ 270', descricao: '', paraQuem: '' }] }, { merge: true });
  });

  await t.test('admin organiza o plano com IA; cliente não pode', async () => {
    await negado(C.chamar('adminExtrairEstrategia', { plano: PLANO }));
    await negado(A.chamar('adminExtrairEstrategia', { plano: 'curto' }), 'invalid-argument');
    const r = await A.chamar('adminExtrairEstrategia', { plano: PLANO });
    assert.ok(r.estrategia.branding.posicionamento);
    assert.equal(r.estrategia.editorias.length, 3);
    assert.doesNotMatch(r.estrategia.observacaoFormatos, /[—–]/);
    assert.deepEqual(r.pendencias, []);
  });

  await t.test('só o admin grava a estratégia; o cliente lê', async () => {
    const ref = (db) => doc(db, 'clientes', u.uid, 'estrategia', 'atual');
    await negado(setDoc(ref(C.db), { branding: { posicionamento: 'eu mesma' } }));
    await setDoc(ref(A.db), { planoDeAcao: PLANO, branding: { posicionamento: 'Confeitaria de bairro sem estresse' }, editorias: [{ nome: 'Kit festa', descricao: 'Oferta', pilar: 'P2' }], formatosPrioritarios: ['reels'] });
    assert.equal((await getDoc(ref(C.db))).data().branding.posicionamento, 'Confeitaria de bairro sem estresse');
  });

  await t.test('foco do mês: cliente define, regras validam', async () => {
    await negado(setDoc(doc(C.db, 'clientes', u.uid, 'focos', '2026-13'), { objetivo: 'x' }));
    await negado(setDoc(doc(C.db, 'clientes', u.uid, 'focos', MES), { objetivo: 'x', campoEstranho: 1 }));
    await setDoc(doc(C.db, 'clientes', u.uid, 'focos', MES), {
      produtoFoco: 'Kit festa 30 potes',
      objetivo: 'Vender 40 kits para festas de fim de ano',
      campanha: { ativa: true, nome: 'Natal sem estresse', oferta: 'Frete grátis', mecanica: 'Quem fechar até dia 10 ganha 5 potes extras', regras: 'Pedidos com 48h', inicio: '2026-11-01', fim: '2099-12-10', comoParticipar: 'Chamar no WhatsApp', cta: 'Chama no WhatsApp' },
    });
    // Admin também edita.
    await setDoc(doc(A.db, 'clientes', u.uid, 'focos', MES), { objetivo: 'Vender 50 kits' }, { merge: true });
  });

  await t.test('roteiro usa o foco e a campanha do mês', async () => {
    const { id } = await C.chamar('gerarRoteiro', { ...base, editoria: 'Kit festa' });
    const r = (await getDoc(doc(C.db, 'clientes', u.uid, 'roteiros', id))).data();
    assert.equal(r.focoMes, MES);
    assert.equal(r.editoria, 'Kit festa');
    assert.match(r.conteudo.bigIdea, /Campanha: Natal sem estresse/);
  });

  await t.test('campanha vencida não entra no roteiro', async () => {
    await setDoc(doc(C.db, 'clientes', u.uid, 'focos', MES), { campanha: { fim: '2020-01-01' } }, { merge: true });
    const { id } = await C.chamar('gerarRoteiro', base);
    const r = (await getDoc(doc(C.db, 'clientes', u.uid, 'roteiros', id))).data();
    assert.doesNotMatch(r.conteudo.bigIdea, /Campanha/);
  });

  await t.test('objetivo do perfil no foco e mistura personalizada pelo admin', async () => {
    await negado(setDoc(doc(C.db, 'clientes', u.uid, 'focos', MES), { objetivoPerfil: 'viralizar' }, { merge: true }));
    await setDoc(doc(C.db, 'clientes', u.uid, 'focos', MES), { objetivoPerfil: 'vender' }, { merge: true });
    await negado(A.chamar('adminAtualizarCliente', { uid: u.uid, mixPersonalizado: { vender: { P1: 50, P2: 50, P3: 10 } } }), 'invalid-argument');
    await negado(A.chamar('adminAtualizarCliente', { uid: u.uid, mixPersonalizado: { sumir: { P1: 50, P2: 50, P3: 0 } } }), 'invalid-argument');
    await A.chamar('adminAtualizarCliente', { uid: u.uid, mixPersonalizado: { vender: { P1: 20, P2: 60, P3: 20 }, crescer: null } });
    const cli = (await getDoc(doc(C.db, 'clientes', u.uid))).data();
    assert.deepEqual(cli.mixPersonalizado, { vender: { P1: 20, P2: 60, P3: 20 } });
    // Cliente não mexe na mistura.
    const { updateDoc } = require('firebase/firestore');
    await negado(updateDoc(doc(C.db, 'clientes', u.uid), { mixPersonalizado: { vender: { P1: 0, P2: 100, P3: 0 } } }));
    // Tudo no padrão: limpa.
    await A.chamar('adminAtualizarCliente', { uid: u.uid, mixPersonalizado: { vender: null } });
    assert.equal((await getDoc(doc(C.db, 'clientes', u.uid))).data().mixPersonalizado, null);
  });

  await t.test('cliente bloqueado não lê estratégia nem foco', async () => {
    await adb.doc(`clientes/${u.uid}`).update({ status: 'bloqueado' });
    await negado(getDoc(doc(C.db, 'clientes', u.uid, 'estrategia', 'atual')));
    await negado(getDoc(doc(C.db, 'clientes', u.uid, 'focos', MES)));
  });

  await deleteApp(C.app);
  await deleteApp(A.app);
});
