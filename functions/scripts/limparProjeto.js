// ATENÇÃO: apaga TODOS os usuários do Auth e TODAS as coleções do Firestore do projeto
// (o padrão do .firebaserc, ou GOOGLE_CLOUD_PROJECT).
// Feito para limpar o sistema antigo antes de usar o projeto nesta plataforma.
// Uso: node scripts/limparProjeto.js --confirmar <id-do-projeto>
const projeto = require('./_projeto');
const { db, auth } = require('../lib/firebase');

async function main() {
  const i = process.argv.indexOf('--confirmar');
  const confirmado = i > -1 ? process.argv[i + 1] : null;
  if (!confirmado || confirmado !== projeto) {
    throw new Error(`Para apagar tudo do projeto "${projeto}", rode: node scripts/limparProjeto.js --confirmar ${projeto}`);
  }

  let usuarios = 0;
  let pagina;
  do {
    const r = await auth.listUsers(1000, pagina);
    if (r.users.length) {
      await auth.deleteUsers(r.users.map((u) => u.uid));
      usuarios += r.users.length;
    }
    pagina = r.pageToken;
  } while (pagina);
  console.log(`Auth: ${usuarios} usuário(s) apagado(s).`);

  const colecoes = await db.listCollections();
  for (const c of colecoes) {
    await db.recursiveDelete(c);
    console.log(`Firestore: coleção "${c.id}" apagada.`);
  }
  console.log('Pronto. Projeto limpo.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message || e); process.exit(1); });
