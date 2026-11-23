const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularTaxas, montarReferencia, diagnosticar, ganchoVencedor, mediana } = require('../diagnostico/regras');
const { benchmarks } = require('../config/seedPadrao');

const regras = (r) => r.achados.map((a) => a.regra);
function rodar(post, historico = [], anterior = null, roteiroFrames = []) {
  const taxas = calcularTaxas(post.formato, post.metricas);
  const referencia = montarReferencia(post.formato, historico, benchmarks);
  return { ...diagnosticar({ post, taxas, referencia, anterior, roteiroFrames }), referencia, taxas };
}

test('taxas e mediana', () => {
  const t = calcularTaxas('reels', { alcance: 1000, compartilhamentos: 20, retencao3s: 45, tempoMedioSeg: 20, duracaoSeg: 50 });
  assert.equal(t.taxaCompart, 0.02);
  assert.equal(t.retencao3s, 0.45);
  assert.equal(t.tempoMedioSobreDuracao, 0.4);
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([4, 1, 2, 3]), 2.5);
});

test('reels: gancho não segurou (referência inicial)', () => {
  const r = rodar({ formato: 'reels', pilar: 'P1', metricas: { alcance: 1000, retencao3s: 20, tempoMedioSeg: 25, duracaoSeg: 50, compartilhamentos: 30 } });
  assert.ok(regras(r).includes('gancho_nao_segurou'));
  assert.match(r.referencia.comparadoCom, /referência inicial/);
});

test('reels: perdeu no meio aponta o segundo da queda', () => {
  const r = rodar({ formato: 'reels', pilar: 'P3', metricas: { alcance: 1000, retencao3s: 50, tempoMedioSeg: 10, duracaoSeg: 60, comentarios: 10, segundoQueda: 14 } });
  const a = r.achados.find((x) => x.regra === 'perdeu_no_meio');
  assert.match(a.mensagem, /segundo 14/);
});

test('reels P2 acima de 90s e poucas conversões', () => {
  const r = rodar({ formato: 'reels', pilar: 'P2', metricas: { alcance: 1000, retencao3s: 50, tempoMedioSeg: 50, duracaoSeg: 100, mensagens: 0, leads: 0 } });
  assert.ok(regras(r).includes('longo_demais'));
  assert.ok(regras(r).includes('p2_poucas_conversoes'));
});

test('teste de ganchos: vencedor e nenhum segurou', () => {
  const ok = rodar({ formato: 'reels', pilar: 'P1', metricas: { alcance: 1000, retencao3s: 40, compartilhamentos: 30, variantes: [{ n: 1, retencao3s: 40, visualizacoes: 900 }, { n: 2, retencao3s: 55, visualizacoes: 700 }, { n: 3, retencao3s: 20 }] } });
  assert.match(ok.achados.find((a) => a.regra === 'gancho_vencedor').mensagem, /gancho 2/);
  const ruim = rodar({ formato: 'reels', pilar: 'P1', metricas: { alcance: 1000, retencao3s: 10, variantes: [{ n: 1, retencao3s: 10 }, { n: 2, retencao3s: 12 }] } });
  assert.ok(regras(ruim).includes('nenhum_gancho'));
  assert.equal(ganchoVencedor([{ n: 1, retencao3s: 30 }]), null);
});

test('P1 sem compartilhamento; P3 sem comentário; carrossel útil pouco identificável', () => {
  assert.ok(regras(rodar({ formato: 'carrossel', pilar: 'P1', metricas: { alcance: 1000, compartilhamentos: 2, salvamentos: 40 } })).includes('p1_sem_compartilhamento'));
  assert.ok(regras(rodar({ formato: 'carrossel', pilar: 'P1', metricas: { alcance: 1000, compartilhamentos: 2, salvamentos: 40 } })).includes('carrossel_util_pouco_identificavel'));
  assert.ok(regras(rodar({ formato: 'post_unico', pilar: 'P3', metricas: { alcance: 1000, comentarios: 1 } })).includes('p3_poucos_comentarios'));
});

test('stories: maior queda com o tipo do frame e sem interação', () => {
  const r = rodar(
    { formato: 'sequencia_stories', pilar: 'P3', metricas: { frames: [{ alcance: 500 }, { alcance: 450 }, { alcance: 100 }, { alcance: 30 }] } },
    [], null, [{ tipo: 'fala' }, { tipo: 'video' }, { tipo: 'enquete' }, { tipo: 'texto' }]
  );
  const q = r.achados.find((a) => a.regra === 'stories_queda');
  assert.match(q.mensagem, /frame 2 \(video\)/);
  assert.ok(regras(r).includes('stories_sem_interacao'));
});

test('funcionou: KPI acima da referência', () => {
  const r = rodar({ formato: 'reels', pilar: 'P1', metricas: { alcance: 1000, retencao3s: 50, tempoMedioSeg: 30, duracaoSeg: 50, compartilhamentos: 40 } });
  assert.equal(r.funcionou, true);
  assert.ok(regras(r).includes('funcionou'));
});

test('referência própria com 3 ou mais posts do mesmo formato', () => {
  const hist = [0.02, 0.03, 0.04].map((x) => ({ formato: 'carrossel', taxas: { taxaCompart: x, alcance: 1000 } }));
  const ref = montarReferencia('carrossel', hist, benchmarks);
  assert.equal(ref.propria, true);
  assert.equal(ref.ref.taxaCompart, 0.03);
  assert.equal(ref.comparadoCom, 'comparado com seus últimos 3 carrosséis');
});

test('1 variável por vez', () => {
  const r = rodar(
    { formato: 'reels', pilar: 'P3', angulo: 'mito_industria', gancho: 'novo', formatoVisual: 'pov', metricas: { alcance: 100, comentarios: 5 } },
    [], { formato: 'reels', angulo: 'erro_comum', gancho: 'velho', formatoVisual: 'pov' }
  );
  assert.match(r.achados.find((a) => a.regra === 'varias_variaveis').mensagem, /ângulo, gancho/);
});
