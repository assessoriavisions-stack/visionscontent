// Datas no fuso de Brasília. O Brasil não tem horário de verão desde 2019,
// então o deslocamento fixo de -03:00 é seguro.
const FUSO = 'America/Sao_Paulo';

function mesReferencia(data = new Date()) {
  // en-CA formata como "2026-11"
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit' }).format(data);
}

// "2026-12-31" -> Date no fim daquele dia em Brasília (23:59:59.999 -03:00)
function fimDoDiaBRT(isoData) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoData || '')) return null;
  const d = new Date(`${isoData}T23:59:59.999-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = { FUSO, mesReferencia, fimDoDiaBRT };
