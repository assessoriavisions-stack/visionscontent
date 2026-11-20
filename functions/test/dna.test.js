const test = require('node:test');
const assert = require('node:assert/strict');
const { faltandoNoDna } = require('../dna');

const completo = {
  negocio: { oQueFaz: 'Bolos de pote', paraQuem: 'Mães', destinoVenda: 'whatsapp' },
  tom: {
    eixos: { tecnicoProximo: 4, serioIrreverente: 3, formalInformal: 5, calmoIntenso: 2 },
    exemplosReais: ['x'.repeat(50), 'y'.repeat(50), 'z'.repeat(50)],
    perfilDeVozExtraido: 'Ritmo: rápido.',
  },
  temaPrincipal: 'Confeitaria',
  subtemas: ['preço'],
};

test('DNA completo não tem pendência', () => assert.deepEqual(faltandoNoDna(completo), []));
test('sem DNA, falta tudo', () => assert.equal(faltandoNoDna(null).length, 8));
test('exemplos curtos não contam', () => {
  const d = { ...completo, tom: { ...completo.tom, exemplosReais: ['curto', 'y'.repeat(50), 'z'.repeat(50)] } };
  assert.deepEqual(faltandoNoDna(d), ['3 exemplos reais']);
});
test('eixo fora da escala', () => {
  const d = { ...completo, tom: { ...completo.tom, eixos: { ...completo.tom.eixos, calmoIntenso: 9 } } };
  assert.deepEqual(faltandoNoDna(d), ['os eixos do tom']);
});
test('destino de venda inválido e sem subtema', () => {
  const d = { ...completo, negocio: { ...completo.negocio, destinoVenda: 'tiktok' }, subtemas: [' '] };
  assert.deepEqual(faltandoNoDna(d), ['onde a venda acontece', 'pelo menos 1 subtema']);
});
