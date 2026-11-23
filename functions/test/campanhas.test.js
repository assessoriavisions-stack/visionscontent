const test = require('node:test');
const assert = require('node:assert/strict');
const { montarEsqueleto, dividirFases } = require('../campanhas');
const { estilosValidos } = require('../ia/catalogos');

test('divisão das fases: ~40/40/20 e soma certa', () => {
  assert.deepEqual(dividirFases(10), { aquecimento: 4, conversao: 4, ultima_chamada: 2 });
  for (let n = 3; n <= 40; n++) {
    const d = dividirFases(n);
    assert.equal(d.aquecimento + d.conversao + d.ultima_chamada, n, `n=${n}`);
    assert.ok(d.aquecimento >= 1 && d.conversao >= 1 && d.ultima_chamada >= 1, `n=${n}`);
  }
});

test('esqueleto: datas, pilares, formatos, estilos e ângulos', () => {
  for (const formatos of [['reels', 'carrossel'], ['reels', 'carrossel', 'sequencia_stories', 'post_unico'], ['carrossel', 'post_unico']]) {
    for (const n of [3, 7, 12, 25]) {
      const { fases, posts } = montarEsqueleto({ dataInicio: '2026-12-01', dataLimite: '2026-12-20', quantidadePosts: n, formatosPermitidos: formatos });
      assert.equal(posts.length, n);
      assert.equal(posts[0].data, '2026-12-01');
      assert.equal(posts[n - 1].data, '2026-12-20');
      for (let i = 1; i < n; i++) assert.ok(posts[i].data >= posts[i - 1].data, 'datas em ordem');
      for (let i = 2; i < n; i++) assert.ok(!(posts[i].formato === posts[i - 1].formato && posts[i].formato === posts[i - 2].formato), `formato 3x seguido (${formatos}, n=${n})`);
      for (let i = 1; i < n; i++) assert.notEqual(posts[i].angulo, posts[i - 1].angulo, 'ângulo repetido em seguida');
      for (const p of posts) {
        assert.ok(formatos.includes(p.formato));
        assert.ok(estilosValidos(p.formato, p.pilar).includes(p.estilo), `${p.formato}/${p.pilar}/${p.estilo}`);
        if (p.fase === 'aquecimento') assert.ok(['P1', 'P3'].includes(p.pilar));
        else assert.equal(p.pilar, 'P2');
      }
      assert.deepEqual(fases.map((f) => f.id), ['aquecimento', 'conversao', 'ultima_chamada']);
      assert.equal(posts.filter((p) => p.fase === 'ultima_chamada').pop().data, '2026-12-20', 'última chamada colada na data-limite');
    }
  }
});
