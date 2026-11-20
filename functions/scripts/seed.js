// Cria config/travaAntiIA e config/benchmarks se não existirem.
// Uso: GOOGLE_APPLICATION_CREDENTIALS=caminho/da/chave.json node scripts/seed.js
//  (ou com FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 para o emulador)
require('./_projeto');
const { inicializarConfig } = require('../admin');

inicializarConfig()
  .then((criados) => {
    console.log(criados.length ? `Criado: ${criados.join(', ')}` : 'Nada a criar: config já existe.');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
