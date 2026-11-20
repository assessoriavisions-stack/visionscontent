// Trava anti-linguagem de IA. Garante no servidor que nenhum texto com padrões típicos
// de IA chega ao cliente como texto aprovado.
//
// Comparação: o texto é normalizado (minúsculas, sem acentos) antes de testar os padrões,
// e os trechos encontrados são devolvidos com a grafia original.

const seed = require('../config/seedPadrao');

const DIACRITICOS = /[̀-ͯ]/g;

// Normaliza mantendo um mapa de posição normalizada -> posição original.
function normalizarComMapa(texto) {
  let norm = '';
  const mapa = [];
  for (let i = 0; i < texto.length; i++) {
    const n = texto[i].normalize('NFD').replace(DIACRITICOS, '').toLowerCase();
    for (const ch of n) {
      norm += ch;
      mapa.push(i);
    }
  }
  return { norm, mapa };
}

const normalizar = (t) => t.normalize('NFD').replace(DIACRITICOS, '').toLowerCase();

function escaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Termos: alternativas separadas por "/", comparadas como palavra/expressão inteira.
function regexDoTermo(valor) {
  const alternativas = valor.split('/').map((v) => normalizar(v.trim())).filter(Boolean);
  if (!alternativas.length) return null;
  const corpo = alternativas.map((a) => escaparRegex(a).replace(/\s+/g, '\\s+')).join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${corpo})(?![\\p{L}\\p{N}])`, 'giu');
}

function compilarPadroes(padroes) {
  const compilados = [];
  for (const p of padroes) {
    if (p.ativo === false) continue;
    if (p.tipo === 'regex') {
      try {
        compilados.push({ ...p, re: new RegExp(p.valor, 'giu') });
      } catch {
        // Regex inválida é barrada no salvamento pelo admin; aqui só ignora.
      }
    } else if (p.tipo === 'termo') {
      const re = regexDoTermo(p.valor);
      if (re) compilados.push({ ...p, re });
    } else if (p.tipo === 'heuristica') {
      compilados.push(p);
    }
  }
  return compilados;
}

// ---------- heurísticas ----------

// Frases: trechos terminados em . ! ? ou fim de linha.
function frases(norm) {
  const out = [];
  const re = /[^.!?\n]+[.!?]*/g;
  let m;
  while ((m = re.exec(norm))) {
    const t = m[0].trim();
    if (t) out.push({ inicio: m.index + m[0].indexOf(t), fim: m.index + m[0].indexOf(t) + t.length, texto: t });
  }
  return out;
}

const palavras = (t) => (t.match(/[\p{L}\p{N}]+/gu) || []).length;

// 3 ou mais frases seguidas com até 4 palavras cada (na mesma linha ou em linhas seguidas).
function heuristicaFrasesVazias(norm) {
  const fs = frases(norm);
  const achados = [];
  let seq = [];
  const fechar = () => {
    if (seq.length >= 3) achados.push({ inicio: seq[0].inicio, fim: seq[seq.length - 1].fim });
    seq = [];
  };
  for (const f of fs) {
    if (palavras(f.texto) <= 4 && palavras(f.texto) > 0) seq.push(f);
    else fechar();
  }
  fechar();
  return achados;
}

// "Rápido. Fácil. Eficaz." 3 palavras/expressões curtas (até 2 palavras) separadas por ponto na mesma linha.
function heuristicaTriade(norm) {
  const re = /(?<![\p{L}\p{N}])(?:[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)?[.!][ \t]*){3,}/gu;
  const achados = [];
  let m;
  while ((m = re.exec(norm))) achados.push({ inicio: m.index, fim: m.index + m[0].trimEnd().length });
  return achados;
}

function heuristicaVoceSabia(norm, campo) {
  if (!/(^|\.)legenda$/.test(campo)) return [];
  const m = norm.match(/^\s*voce\s+sabia/);
  return m ? [{ inicio: m.index, fim: m.index + m[0].length }] : [];
}

function heuristicaEmojiNaFala(norm, campo) {
  if (!/(^|\.)fala$/.test(campo)) return [];
  const achados = [];
  const re = /\p{Extended_Pictographic}/gu;
  let m;
  while ((m = re.exec(norm))) achados.push({ inicio: m.index, fim: m.index + m[0].length });
  return achados;
}

const HEURISTICAS = {
  frases_vazias: heuristicaFrasesVazias,
  triade: heuristicaTriade,
  legenda_voce_sabia: heuristicaVoceSabia,
  emoji_na_fala: heuristicaEmojiNaFala,
};

// ---------- validação ----------

// Valida um texto. `campo` é o caminho do campo (ex.: "blocos.0.fala", "legenda").
function validarTexto(texto, compilados, campo = '') {
  if (typeof texto !== 'string' || !texto.trim()) return [];
  const { norm, mapa } = normalizarComMapa(texto);
  const trecho = (ini, fim) => texto.slice(mapa[ini], (mapa[fim - 1] ?? texto.length - 1) + 1);
  const violacoes = [];
  for (const p of compilados) {
    let achados = [];
    if (p.re) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(norm))) {
        if (!m[0].length) { p.re.lastIndex++; continue; }
        achados.push({ inicio: m.index, fim: m.index + m[0].length });
      }
    } else if (HEURISTICAS[p.valor] || HEURISTICAS[p.id]) {
      achados = (HEURISTICAS[p.valor] || HEURISTICAS[p.id])(norm, campo);
    }
    for (const a of achados) {
      violacoes.push({ padraoId: p.id, descricao: p.descricao || p.valor, campo, trecho: trecho(a.inicio, a.fim) });
    }
  }
  return violacoes;
}

// Percorre todos os campos de texto de um objeto (ou string) e devolve [{ padraoId, campo, trecho }].
function coletarTextos(valor, caminho = '', saida = []) {
  if (typeof valor === 'string') saida.push({ campo: caminho, texto: valor });
  else if (Array.isArray(valor)) valor.forEach((v, i) => coletarTextos(v, caminho ? `${caminho}.${i}` : String(i), saida));
  else if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) coletarTextos(v, caminho ? `${caminho}.${k}` : k, saida);
  }
  return saida;
}

// Campos que não são texto para o cliente (ids, tipos, tempos) ficam fora da validação.
const CAMPOS_IGNORADOS = /(^|\.)(tipo|tempo|n|angulo|formato|id)$/;

function validar(conteudo, padroes) {
  const compilados = compilarPadroes(padroes);
  const violacoes = [];
  for (const { campo, texto } of coletarTextos(conteudo)) {
    if (CAMPOS_IGNORADOS.test(campo)) continue;
    violacoes.push(...validarTexto(texto, compilados, campo));
  }
  return violacoes;
}

// ---------- correções automáticas seguras ----------

function corrigirTexto(t) {
  return t
    .replace(/^\s*[—–]\s*/gm, '')            // travessão abrindo linha (diálogo/lista)
    .replace(/\s*[—–]\s*$/gm, '.')            // travessão fechando linha
    .replace(/\s+[—–]\s+/g, ', ')             // "palavra — palavra"
    .replace(/(\S)[—–](\S)/g, '$1, $2')       // "palavra—palavra"
    .replace(/,\s*,/g, ',')
    .replace(/[ \t]{2,}/g, ' ');
}

function corrigir(conteudo) {
  if (typeof conteudo === 'string') return corrigirTexto(conteudo);
  if (Array.isArray(conteudo)) return conteudo.map(corrigir);
  if (conteudo && typeof conteudo === 'object') {
    return Object.fromEntries(Object.entries(conteudo).map(([k, v]) => [k, CAMPOS_IGNORADOS.test(k) ? v : corrigir(v)]));
  }
  return conteudo;
}

// ---------- loop completo ----------

// reescrever(conteudo, violacoes) -> Promise<conteudo novo>. Recebe só os trechos que violaram.
async function aplicarTrava(conteudoInicial, padroes, reescrever, { maxReescritas = 2 } = {}) {
  let conteudo = conteudoInicial;
  const encontradas = [];
  const historico = []; // [{ tentativa, violacoes }]
  let violacoes = validar(conteudo, padroes);
  historico.push({ tentativa: 0, violacoes });
  encontradas.push(...violacoes);

  let tentativas = 0;
  while (violacoes.length && tentativas < maxReescritas && reescrever) {
    tentativas++;
    try {
      conteudo = await reescrever(conteudo, violacoes);
    } catch (e) {
      console.error('trava: falha ao reescrever', e);
      break;
    }
    violacoes = validar(conteudo, padroes);
    historico.push({ tentativa: tentativas, violacoes });
    encontradas.push(...violacoes);
  }

  if (violacoes.length) {
    conteudo = corrigir(conteudo);
    violacoes = validar(conteudo, padroes);
    historico.push({ tentativa: 'correcao_automatica', violacoes });
  }

  return {
    conteudo,
    trava: {
      tentativas,
      violacoesEncontradas: encontradas.map(({ padraoId, campo, trecho }) => ({ padraoId, campo, trecho })),
      // O que sobrou: o editor marca com sublinhado e a dica para reescrever.
      pendentes: violacoes.map(({ padraoId, campo, trecho }) => ({ padraoId, campo, trecho })),
      passou: violacoes.length === 0,
    },
    historico,
  };
}

// Texto de instrução para a chamada de reescrita.
function instrucaoReescrita(violacoes) {
  const linhas = violacoes.map((v, i) => `${i + 1}. Campo "${v.campo || 'texto'}": "${v.trecho}" (regra quebrada: ${v.descricao || v.padraoId})`);
  return (
    'Os trechos abaixo quebram regras de escrita proibidas. Reescreva só esses trechos, com as palavras da pessoa, ' +
    'mantendo todo o resto exatamente igual. Não use travessão, não use contraste do tipo "não é X, é Y" e não troque ' +
    'um termo proibido por um sinônimo de mesmo efeito.\n\n' + linhas.join('\n')
  );
}

// ---------- padrões do banco ----------

async function carregarPadroes(db, palavrasProibidasCliente = []) {
  let base = seed.padroesBase;
  try {
    const snap = await db.doc('config/travaAntiIA').get();
    if (snap.exists && Array.isArray(snap.data().padroesBase)) base = snap.data().padroesBase;
  } catch (e) {
    console.error('trava: não consegui ler config/travaAntiIA, usando a lista inicial', e);
  }
  const extras = (palavrasProibidasCliente || [])
    .filter((p) => typeof p === 'string' && p.trim())
    .map((p, i) => ({ id: `cliente_proibida_${i}`, tipo: 'termo', valor: p.trim(), descricao: `palavra proibida do perfil: "${p.trim()}"`, ativo: true }));
  return [...base, ...extras];
}

// Registra as violações em logs/trava (só o admin lê).
async function registrarLogs(db, { uid, refId, origem, historico }) {
  const lote = db.batch();
  let n = 0;
  const pendentesFinais = new Set(
    (historico[historico.length - 1]?.violacoes || []).map((v) => `${v.padraoId}|${v.trecho}`)
  );
  for (const h of historico) {
    for (const v of h.violacoes) {
      if (h.tentativa === 'correcao_automatica') continue;
      lote.set(db.collection('logs').doc('trava').collection('registros').doc(), {
        uid,
        roteiroId: refId || null,
        origem: origem || 'roteiro',
        padraoId: v.padraoId,
        campo: v.campo,
        trecho: v.trecho.slice(0, 500),
        tentativa: h.tentativa,
        resolvido: !pendentesFinais.has(`${v.padraoId}|${v.trecho}`),
        em: new Date(),
      });
      if (++n >= 450) break;
    }
  }
  if (n) await lote.commit();
}

module.exports = {
  normalizar,
  compilarPadroes,
  validarTexto,
  validar,
  corrigir,
  aplicarTrava,
  instrucaoReescrita,
  carregarPadroes,
  registrarLogs,
};
