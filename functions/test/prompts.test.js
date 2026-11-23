const test = require('node:test');
const assert = require('node:assert/strict');
const { blocoFoco } = require('../ia/prompts');
const { mixDoCliente } = require('../ia/catalogos');

test('foco do mês leva o objetivo do perfil para o prompt', () => {
  const t = blocoFoco({ objetivoPerfil: 'autoridade', produtoFoco: 'Kit festa' }, 'P3');
  assert.match(t, /Objetivo do perfil neste mês: Aumentar a autoridade/);
  assert.match(t, /Produto em destaque: Kit festa/);
});

test('mistura: padrão do método e personalizada por cliente', () => {
  assert.deepEqual(mixDoCliente('crescer', {}), { P1: 60, P2: 15, P3: 25 });
  assert.deepEqual(mixDoCliente('autoridade', null), { P1: 30, P2: 20, P3: 50 });
  assert.deepEqual(mixDoCliente('vender', { mixPersonalizado: { vender: { P1: 20, P2: 60, P3: 20 } } }), { P1: 20, P2: 60, P3: 20 });
  assert.equal(mixDoCliente(undefined, {}), null);
});
