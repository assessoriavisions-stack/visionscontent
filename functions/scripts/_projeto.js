// Usa o projeto padrão do .firebaserc quando GOOGLE_CLOUD_PROJECT não estiver definido.
const fs = require('fs');
const path = require('path');

if (!process.env.GOOGLE_CLOUD_PROJECT && !process.env.GCLOUD_PROJECT) {
  const rc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '.firebaserc'), 'utf8'));
  process.env.GOOGLE_CLOUD_PROJECT = rc.projects.default;
}
module.exports = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
