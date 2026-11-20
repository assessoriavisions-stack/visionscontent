// Wrapper da API da Anthropic. Só roda dentro das Cloud Functions:
// a chave fica no Secret Manager e nunca vai para o navegador.
const Anthropic = require('@anthropic-ai/sdk');
const { HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
// Modelo trocável sem mexer no código: functions/.env (MODEL_ID=...) e novo deploy.
const MODEL_ID = defineString('MODEL_ID', { default: 'claude-opus-5-5' });

// Só nos emuladores, com IA_FAKE=1 em functions/.env.local: respostas simuladas para testes.
const MODO_FALSO = () => process.env.FUNCTIONS_EMULATOR === 'true' && process.env.IA_FAKE === '1';
const respostasFalsas = new Map();
function registrarRespostaFalsa(chave, fn) {
  respostasFalsas.set(chave, fn);
}

let cliente = null;
function obterCliente() {
  if (!cliente) cliente = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), maxRetries: 2, timeout: 120_000 });
  return cliente;
}

// Gera texto. `chave` identifica a tarefa (usada no modo falso e nos logs).
// Com `esquema`, pede JSON estruturado (a API garante o formato).
async function gerarTexto({ chave, system, mensagens, maxTokens = 8000, effort = 'medium', esquema = null }) {
  if (MODO_FALSO()) {
    const fn = respostasFalsas.get(chave);
    if (!fn) throw new Error(`Sem resposta falsa registrada para "${chave}"`);
    const r = await fn({ system, mensagens });
    return typeof r === 'string' ? r : JSON.stringify(r);
  }

  let resposta;
  try {
    resposta = await obterCliente().beta.messages.create({
      model: MODEL_ID.value(),
      max_tokens: maxTokens,
      system,
      messages: mensagens,
      output_config: esquema ? { effort, format: { type: 'json_schema', schema: esquema } } : { effort },
      // Se o modelo principal recusar por política, a API refaz no modelo de reserva.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      throw new HttpsError('resource-exhausted', 'Muita gente usando agora. Espere um minuto e tente de novo.');
    }
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('IA: chave inválida ou ausente');
      throw new HttpsError('internal', 'A escrita automática está fora do ar. Avise a Visions.');
    }
    if (e instanceof Anthropic.APIError) {
      console.error(`IA: erro ${e.status}`, e.message);
      throw new HttpsError('unavailable', 'A escrita automática não respondeu. Tente de novo em alguns minutos.');
    }
    throw e;
  }

  if (resposta.stop_reason === 'refusal') {
    console.warn('IA: recusa', resposta.stop_details);
    throw new HttpsError('failed-precondition', 'Não consegui escrever sobre esse assunto. Tente outro tema ou outra forma de pedir.');
  }
  const texto = resposta.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!texto) throw new HttpsError('unavailable', 'A resposta veio vazia. Tente de novo.');
  if (resposta.stop_reason === 'max_tokens') console.warn(`IA: resposta cortada em ${chave}`);
  return texto;
}

// Gera JSON no esquema pedido. `validar(obj)` devolve lista de problemas; se vier quebrado
// ou com problema, tenta de novo uma vez mostrando o que corrigir.
async function gerarJSON({ chave, system, mensagens, esquema, validar = () => [], maxTokens = 16000, effort = 'medium' }) {
  let conversa = mensagens;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const texto = await gerarTexto({ chave, system, mensagens: conversa, maxTokens, effort, esquema });
    let obj = null;
    let problemas;
    try {
      obj = JSON.parse(texto);
      problemas = validar(obj);
    } catch {
      problemas = ['a resposta não veio em JSON válido'];
    }
    if (!problemas.length) return obj;
    console.warn(`IA: ${chave} com problemas (tentativa ${tentativa + 1}):`, problemas);
    conversa = [
      ...mensagens,
      { role: 'assistant', content: texto },
      { role: 'user', content: `Corrija estes problemas e devolva o JSON completo:\n- ${problemas.join('\n- ')}` },
    ];
    if (tentativa === 1) {
      throw new HttpsError('internal', 'Não consegui montar o conteúdo no formato certo. Tente de novo.');
    }
  }
  return null;
}

module.exports = { ANTHROPIC_API_KEY, MODEL_ID, gerarTexto, gerarJSON, registrarRespostaFalsa, MODO_FALSO };
