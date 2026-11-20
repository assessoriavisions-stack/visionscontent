// Aceite da Fase 3: geração + trava (IA simulada nos emuladores).
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc } = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const admin = require('firebase-admin');
const { validar } = require('../functions/ia/travaAntiIA');
const { padroesBase } = require('../functions/config/seedPadrao');

const PROJETO = 'visionscontent-cba52';
if (!admin.apps.length) admin.initializeApp({ projectId: PROJETO });
const adb = admin.firestore();

let n = 0;
function novoApp() {
  const app = initializeApp({ apiKey: 'fake', projectId: PROJETO, authDomain: `${PROJETO}.firebaseapp.com` }, `ger${n++}`);
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
  negocio: { oQueFaz: 'Bolos de pote', paraQuem: 'Mães que fazem festa em casa', destinoVenda: 'whatsapp' },
  tom: { eixos: { tecnicoProximo: 4, serioIrreverente: 3, formalInformal: 5, calmoIntenso: 2 }, exemplosReais: ['x'.repeat(60), 'y'.repeat(60), 'z'.repeat(60)], perfilDeVozExtraido: 'Ritmo: rápido.' },
  produtos: [{ nome: 'Kit festa 30 potes', preco: 'R$ 270' }], expressoesQueUsa: ['gente'], palavrasProibidas: ['gourmet'], temaPrincipal: 'Confeitaria', subtemas: ['forno', 'preço'], onboardingConcluido: true,
};
const BASE = { formato: 'reels', pilar: 'P1', estilo: 'analise', angulo: 'erro_comum', tema: 'bolo que murcha', framework: 'AIDA', formatoVisual: 'talking_head', cta: 'enviar', estiloLegenda: 'explicativa' };

async function criarCliente(email, comDna = true) {
  const u = await admin.auth().createUser({ email, password: 'senha-teste-1' });
  await adb.doc(`clientes/${u.uid}`).set({ nome: 'Teste', email, status: 'ativo', venceEm: null, limiteGeracoesMes: null, geracoesNoMes: 0, mesReferencia: '2026-11', crescimento: { fase: 'testes', vencedor: null } });
  if (comDna) await adb.doc(`clientes/${u.uid}/dna/atual`).set(DNA);
  const C = novoApp();
  await signInWithEmailAndPassword(C.auth, email, 'senha-teste-1');
  return { uid: u.uid, C };
}

test('geração de roteiros', async (t) => {
  const { uid, C } = await criarCliente('gera@cliente.test');
  const ler = async (id) => (await getDoc(doc(C.db, 'clientes', uid, 'roteiros', id))).data();

  await t.test('sem DNA completo não gera', async () => {
    const outro = await criarCliente('semdna@cliente.test', false);
    await negado(outro.C.chamar('gerarRoteiro', BASE), 'failed-precondition');
    await negado(outro.C.chamar('sugerirTemas', BASE), 'failed-precondition');
    await deleteApp(outro.C.app);
  });

  await t.test('estilo inválido para formato + pilar', async () => {
    await negado(C.chamar('gerarRoteiro', { ...BASE, formato: 'post_unico', pilar: 'P1', estilo: 'cultura_pop' }), 'invalid-argument');
    await negado(C.chamar('gerarRoteiro', { ...BASE, tema: '' }), 'invalid-argument');
  });

  await t.test('reels: 5 ganchos, 3 ângulos e trava com marcação', async () => {
    const { id } = await C.chamar('gerarRoteiro', BASE);
    const r = await ler(id);
    assert.equal(r.conteudo.ganchos.length, 5);
    assert.equal(r.conteudo.angulosParaTestar.length, 3);
    assert.equal(r.status, 'rascunho');
    assert.equal(r.versoes.length, 1);
    assert.ok(r.duracaoEstimadaSeg > 0 && r.duracaoEstimadaSeg <= 90);
    const contexto = r.conteudo.blocos.find((b) => b.tipo === 'contexto').fala;
    assert.doesNotMatch(contexto, /É importante/);
    assert.doesNotMatch(contexto, /[—–]/, 'travessão corrigido automaticamente');
    assert.equal(r.trava.passou, false);
    assert.deepEqual(r.trava.pendentes.map((p) => p.padraoId), ['jornada']);
    assert.equal(r.trava.pendentes[0].campo, 'legenda');
    assert.ok(r.trava.violacoesEncontradas.some((v) => v.padraoId === 'e_importante'));
    const cli = (await adb.doc(`clientes/${uid}`).get()).data();
    assert.equal(cli.geracoesNoMes, 1);
  });

  await t.test('duração: P2 longo é cortado; se continuar longo, sai com aviso', async () => {
    const p2 = { ...BASE, pilar: 'P2', estilo: 'tecnico', framework: 'CCCA', cta: 'link_bio' };
    const a = await ler((await C.chamar('gerarRoteiro', { ...p2, tema: 'forno LONGO' })).id);
    assert.ok(a.duracaoEstimadaSeg <= 90);
    assert.deepEqual(a.avisos, []);
    const b = await ler((await C.chamar('gerarRoteiro', { ...p2, tema: 'forno LONGUISSIMO' })).id);
    assert.ok(b.duracaoEstimadaSeg > 90);
    assert.deepEqual(b.avisos, ['Acima de 1min30 esse vídeo não roda bem como anúncio.']);
    // P3 não tem limite de duração.
    const c = await ler((await C.chamar('gerarRoteiro', { ...BASE, pilar: 'P3', estilo: 'opiniao', cta: 'comentar', tema: 'forno LONGUISSIMO' })).id);
    assert.deepEqual(c.avisos, []);
  });

  await t.test('série: parte N só depois da N-1, até o total', async () => {
    const p1 = await ler((await C.chamar('gerarRoteiro', { ...BASE, formato: 'serie', cta: 'parte2' })).id);
    assert.equal(p1.parteSerie, 1);
    const serieId = p1.serieId;
    const p2 = await ler((await C.chamar('gerarRoteiro', { continuarSerie: serieId })).id);
    assert.equal(p2.parteSerie, 2);
    assert.equal(p2.serieId, serieId);
    const p3 = await ler((await C.chamar('gerarRoteiro', { continuarSerie: serieId })).id);
    assert.equal(p3.parteSerie, 3);
    await negado(C.chamar('gerarRoteiro', { continuarSerie: serieId }), 'failed-precondition');
  });

  await t.test('sugerir temas: tema com cara de IA não aparece', async () => {
    const r = await C.chamar('sugerirTemas', { formato: 'reels', pilar: 'P1', estilo: 'analise', angulo: 'erro_comum' });
    assert.equal(r.temas.length, 4);
    assert.ok(r.temas.every((t) => !/jornada/i.test(t.tema)));
  });

  await t.test('20 gerações variadas: nenhum padrão sem marcação', async () => {
    const combos = [
      { formato: 'reels', pilar: 'P1', estilo: 'cultura_pop', framework: 'AIDA', cta: 'enviar' },
      { formato: 'reels', pilar: 'P2', estilo: 'transformacao', framework: 'ADP', cta: 'direct' },
      { formato: 'reels', pilar: 'P3', estilo: 'desejo', framework: 'AIDA', cta: 'comentar' },
      { formato: 'carrossel', pilar: 'P1', estilo: 'analise', framework: 'AIDA', cta: 'salvar' },
      { formato: 'carrossel', pilar: 'P2', estilo: 'prova_social', framework: 'ADP', cta: 'link_bio' },
      { formato: 'carrossel', pilar: 'P3', estilo: 'noticia', framework: 'AIDA', cta: 'comentar' },
      { formato: 'post_unico', pilar: 'P3', estilo: 'opiniao', framework: 'AIDA', cta: 'comentar' },
      { formato: 'post_unico', pilar: 'P2', estilo: 'prova_social', framework: 'ADP', cta: 'direct' },
      { formato: 'sequencia_stories', pilar: 'P3', estilo: 'bastidor', framework: 'AIDA', cta: 'enquete' },
      { formato: 'story_unico', pilar: 'P2', estilo: 'interacao', framework: 'ADP', cta: 'enquete' },
    ];
    const angs = ['erro_comum', 'maior_desejo', 'mito_industria', 'historia_pessoal', 'duvida_comum', 'passo_a_passo'];
    const ids = [];
    for (let i = 0; i < 20; i++) {
      const c = combos[i % combos.length];
      const ehStory = c.formato.includes('stor');
      const dados = { ...c, angulo: angs[i % angs.length], tema: `tema variado ${i}`, formatoVisual: c.formato === 'reels' ? 'pov' : undefined, estiloLegenda: ehStory ? undefined : 'storytelling' };
      ids.push((await C.chamar('gerarRoteiro', dados)).id);
    }
    const padroes = [...padroesBase, { id: 'cliente_proibida_0', tipo: 'termo', valor: 'gourmet', ativo: true }];
    for (const id of ids) {
      const r = await ler(id);
      const achados = validar(r.conteudo, padroes);
      const marcados = new Set(r.trava.pendentes.map((p) => `${p.padraoId}|${p.campo}|${p.trecho}`));
      for (const a of achados) {
        assert.ok(marcados.has(`${a.padraoId}|${a.campo}|${a.trecho}`), `${id}: "${a.trecho}" (${a.padraoId}) chegou sem marcação`);
      }
      assert.equal(r.trava.passou, achados.length === 0);
    }
  });

  await t.test('limite mensal barra a geração', async () => {
    const atual = (await adb.doc(`clientes/${uid}`).get()).data().geracoesNoMes;
    await adb.doc(`clientes/${uid}`).update({ limiteGeracoesMes: atual });
    await negado(C.chamar('gerarRoteiro', BASE), 'resource-exhausted');
  });

  await t.test('cliente não cria roteiro direto nem mexe na trava', async () => {
    const { setDoc, updateDoc, collection, addDoc } = require('firebase/firestore');
    await negado(addDoc(collection(C.db, 'clientes', uid, 'roteiros'), { formato: 'reels', status: 'rascunho' }));
    const snap = await adb.collection(`clientes/${uid}/roteiros`).limit(1).get();
    await negado(updateDoc(doc(C.db, 'clientes', uid, 'roteiros', snap.docs[0].id), { 'trava.passou': true }));
    await negado(updateDoc(doc(C.db, 'clientes', uid, 'roteiros', snap.docs[0].id), { status: 'postado' }));
  });

  await deleteApp(C.app);
});
