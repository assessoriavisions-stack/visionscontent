// Fase 6: lembretes de métricas (seção 13).
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getMessaging } = require('firebase-admin/messaging');
const { db, Timestamp, FieldValue } = require('./lib/firebase');
const { OPCOES_PADRAO } = require('./lib/middleware');
const { FUSO } = require('./lib/tempo');

const TOKEN_INVALIDO = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

function dataCurta(ts) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(ts.toDate());
}

// Envio real pelo FCM. Devolve os tokens que não valem mais.
async function enviarPushFCM(tokens, dados) {
  if (!tokens.length) return [];
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    console.log(`[emulador] push não enviado para ${tokens.length} aparelho(s):`, dados.titulo);
    return [];
  }
  const r = await getMessaging().sendEachForMulticast({
    tokens,
    data: dados, // só dados: o service worker monta a notificação (funciona também no iPhone)
    webpush: { headers: { Urgency: 'high', TTL: String(3 * 24 * 3600) } },
  });
  return r.responses.map((x, i) => (!x.success && TOKEN_INVALIDO.has(x.error?.code) ? tokens[i] : null)).filter(Boolean);
}

// Processa os lembretes vencidos. `enviarPush` pode ser trocado nos testes.
async function processarLembretes({ agora = Timestamp.now(), enviarPush = enviarPushFCM, limite = 300 } = {}) {
  const fila = await db.collection('lembretes').where('em', '<=', agora).orderBy('em').limit(limite).get();
  const clientes = new Map();
  const resumo = { enviados: 0, pulados: 0, jaMedidos: 0 };

  for (const item of fila.docs) {
    const { uid, postId, indice } = item.data();
    if (!clientes.has(uid)) {
      const c = await db.doc(`clientes/${uid}`).get();
      clientes.set(uid, c.exists ? c.data() : null);
    }
    const cliente = clientes.get(uid);
    const postRef = db.doc(`clientes/${uid}/posts/${postId}`);
    const post = await postRef.get();

    // Post apagado, cliente bloqueado ou métrica já preenchida: o lembrete sai da fila sem envio.
    if (!post.exists || !cliente || cliente.status !== 'ativo') {
      await item.ref.delete();
      resumo.pulados++;
      continue;
    }
    const p = post.data();
    if (p.metricas) {
      await item.ref.delete();
      resumo.jaMedidos++;
      continue;
    }

    const titulo = 'Como foi o seu post?';
    const texto = `Como foi o post de ${dataCurta(p.postadoEm)}? Leva 1 minuto preencher e eu te digo o que ajustar no próximo.`;
    await db.collection(`clientes/${uid}/notificacoes`).add({ tipo: 'lembrete_metricas', postId, titulo, texto, lida: false, criadoEm: FieldValue.serverTimestamp() });

    const tokens = [...new Set(cliente.fcmTokens || [])];
    let invalidos = [];
    try {
      invalidos = await enviarPush(tokens, { titulo, texto, postId, tipo: 'lembrete_metricas' });
    } catch (e) {
      console.error('lembretes: falha no push', e.message);
    }
    if (invalidos.length) {
      await db.doc(`clientes/${uid}`).update({ fcmTokens: FieldValue.arrayRemove(...invalidos) });
      cliente.fcmTokens = (cliente.fcmTokens || []).filter((t) => !invalidos.includes(t));
    }

    const lembretes = [...(p.lembretes || [])];
    if (lembretes[indice]) lembretes[indice] = { ...lembretes[indice], enviado: true };
    await postRef.update({ lembretes });
    await item.ref.delete();
    resumo.enviados++;
  }
  return resumo;
}

exports.enviarLembretes = onSchedule({ ...OPCOES_PADRAO, schedule: '0 * * * *', timeZone: FUSO }, async () => {
  const r = await processarLembretes();
  console.log('enviarLembretes:', JSON.stringify(r));
});

exports.processarLembretes = processarLembretes;
