// Dá o papel de admin (custom claim admin: true) a um usuário existente no Auth.
// Se o e-mail ainda não tem login, cria com a senha informada.
// Uso: node scripts/definirAdmin.js email@dominio.com [senhaInicial]
const { auth } = require('../lib/firebase');

async function main() {
  const [email, senha] = process.argv.slice(2);
  if (!email) throw new Error('Informe o e-mail: node scripts/definirAdmin.js email@dominio.com [senha]');
  let usuario;
  try {
    usuario = await auth.getUserByEmail(email);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    if (!senha) throw new Error('Esse e-mail não tem login. Passe também uma senha inicial (mín. 6 caracteres).');
    usuario = await auth.createUser({ email, password: senha });
    console.log('Login criado.');
  }
  await auth.setCustomUserClaims(usuario.uid, { ...(usuario.customClaims || {}), admin: true });
  await auth.revokeRefreshTokens(usuario.uid); // força o próximo login a trazer o claim
  console.log(`${email} agora é admin (uid ${usuario.uid}). Entre de novo na plataforma.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message || e); process.exit(1); });
