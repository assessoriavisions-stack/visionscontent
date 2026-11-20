const test = require('node:test');
const assert = require('node:assert/strict');
const { validar, aplicarTrava, corrigir } = require('../ia/travaAntiIA');
const { padroesBase } = require('../config/seedPadrao');

const ids = (v) => [...new Set(v.map((x) => x.padraoId))].sort();

// Um texto montado de propósito para cada padrão da lista base.
const CASOS = {
  contraste_nao_e: 'Isso não é sobre dinheiro, é sobre tempo.',
  contraste_nao_se_trata: 'Não se trata de vender mais.',
  contraste_mais_do_que: 'Mais do que um corte, é um recomeço.',
  travessao: 'Eu treino cedo — sempre antes do café.',
  nesse_contexto: 'Nesse contexto a gente precisa agir.',
  e_importante: 'É importante lembrar de beber água.',
  e_essencial: 'Dormir bem é fundamental para render.',
  ninguem_conta: 'O que ninguém fala sobre confeitaria em casa.',
  vale_ressaltar: 'Vale ressaltar que o forno muda tudo.',
  em_suma: 'Em resumo, use manteiga gelada.',
  mundo_hoje: 'Cada vez mais gente faz bolo em casa.',
  verbos_ia: 'Vamos desvendar o segredo da massa.',
  jornada: 'Minha jornada na cozinha começou cedo.',
  pergunta_retorica: 'E sabe o que é pior? Ninguém mede a farinha.',
  frases_vazias: 'Comecei cedo. Errei muito. Aprendi tudo. E hoje vendo duzentos bolos por semana para a cidade inteira.',
  triade: 'Rápido. Fácil. Eficaz.',
  rotulo_estrutura: 'GANCHO: olha esse bolo',
};

test('cada padrão da lista base é detectado no texto montado para ele', () => {
  for (const p of padroesBase) {
    if (p.id === 'legenda_voce_sabia' || p.id === 'emoji_na_fala') continue;
    const texto = CASOS[p.id];
    assert.ok(texto, `falta caso de teste para ${p.id}`);
    const v = validar({ fala: texto }, padroesBase);
    assert.ok(v.some((x) => x.padraoId === p.id), `${p.id} não detectado em "${texto}" (achou: ${ids(v)})`);
  }
});

test('heurísticas dependentes do campo', () => {
  assert.deepEqual(ids(validar({ legenda: 'Você sabia que o bolo murcha?' }, padroesBase)), ['legenda_voce_sabia']);
  assert.deepEqual(ids(validar({ fala: 'Você sabia que o bolo murcha?' }, padroesBase)), []);
  assert.deepEqual(ids(validar({ blocos: [{ fala: 'Olha esse bolo 🎂 que delícia' }] }, padroesBase)), ['emoji_na_fala']);
  assert.deepEqual(ids(validar({ legenda: 'Olha esse bolo 🎂 que delícia' }, padroesBase)), []);
});

test('texto limpo passa sem violação', () => {
  const ok = {
    bigIdea: 'Bolo de pote rende mais quando a massa descansa na geladeira.',
    blocos: [
      { tipo: 'gancho', tempo: '00:00-00:03', fala: 'Meu bolo de pote murchava toda sexta, até eu mudar uma coisa no forno.', visual: 'Close no pote', textoTela: 'Por que murcha?' },
      { tipo: 'conteudo', fala: 'Deixa a massa meia hora na geladeira antes de assar. A manteiga firma e o bolo cresce por igual.', visual: 'Plano aberto da bancada' },
    ],
    legenda: 'Testei três sextas seguidas e a diferença apareceu na primeira fornada. Comenta GELADEIRA que eu te mando a receita.',
  };
  assert.deepEqual(validar(ok, padroesBase), []);
});

test('não confunde frases normais com contraste', () => {
  assert.deepEqual(ids(validar({ fala: 'Isso não é fácil de fazer em casa.' }, padroesBase)), []);
  assert.deepEqual(ids(validar({ fala: 'Não é todo dia que dá certo, mas dá.' }, padroesBase)), []);
});

test('ignora campos técnicos (tipo, tempo)', () => {
  assert.deepEqual(validar({ tipo: 'cta', tempo: '00:10—00:12' }, padroesBase), []);
});

test('trecho volta com a grafia original (acentos e maiúsculas)', () => {
  const [v] = validar({ fala: 'Olha, É IMPORTANTE saber.' }, padroesBase);
  assert.equal(v.trecho, 'É IMPORTANTE');
  assert.equal(v.campo, 'fala');
});

test('palavras proibidas do cliente entram como termos extras', () => {
  const padroes = [...padroesBase, { id: 'cliente_proibida_0', tipo: 'termo', valor: 'gourmet', ativo: true }];
  assert.deepEqual(ids(validar({ fala: 'Bolo Gourmet de pote' }, padroes)), ['cliente_proibida_0']);
  assert.deepEqual(ids(validar({ fala: 'Bolo gourmetizado' }, padroes)), []);
});

test('padrão desligado pelo admin não barra', () => {
  const padroes = padroesBase.map((p) => (p.id === 'jornada' ? { ...p, ativo: false } : p));
  assert.deepEqual(ids(validar({ fala: 'Minha jornada começou cedo.' }, padroes)), []);
});

test('correção automática do travessão', () => {
  assert.equal(corrigir('Eu treino cedo — sempre antes do café.'), 'Eu treino cedo, sempre antes do café.');
  assert.equal(corrigir('— Começa assim'), 'Começa assim');
  assert.equal(corrigir('bolo—torta'), 'bolo, torta');
});

test('loop: reescreve até 2 vezes e marca o que sobrar', async () => {
  let chamadas = 0;
  const r1 = await aplicarTrava({ fala: 'É importante assar devagar.' }, padroesBase, async () => {
    chamadas++;
    return { fala: 'Asse devagar, com o forno a 160 graus.' };
  });
  assert.equal(chamadas, 1);
  assert.equal(r1.trava.passou, true);
  assert.equal(r1.trava.violacoesEncontradas[0].padraoId, 'e_importante');

  chamadas = 0;
  const r2 = await aplicarTrava({ fala: 'É importante assar devagar — sempre.' }, padroesBase, async (c) => {
    chamadas++;
    return c; // IA insiste
  });
  assert.equal(chamadas, 2);
  assert.equal(r2.conteudo.fala, 'É importante assar devagar, sempre.');
  assert.equal(r2.trava.passou, false);
  assert.deepEqual(r2.trava.pendentes.map((p) => p.padraoId), ['e_importante']);
});
