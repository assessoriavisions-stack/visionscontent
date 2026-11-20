// Ponto de entrada das Cloud Functions da Plataforma de Roteiros Visions.
const admin = require('./admin');

// Fase 1: acesso e admin
exports.adminCriarCliente = admin.adminCriarCliente;
exports.adminAtualizarCliente = admin.adminAtualizarCliente;
exports.adminBloquearCliente = admin.adminBloquearCliente;
exports.adminDesbloquearCliente = admin.adminDesbloquearCliente;
exports.adminRedefinirSenha = admin.adminRedefinirSenha;
exports.adminInicializarConfig = admin.adminInicializarConfig;
exports.verificarVencimentos = admin.verificarVencimentos;
exports.resetarContadorMensal = admin.resetarContadorMensal;

// Fase 2: DNA do perfil
const dna = require('./dna');
exports.extrairPerfilDeVoz = dna.extrairPerfilDeVoz;

// Fase 3: geração
const roteiros = require('./roteiros');
exports.sugerirTemas = roteiros.sugerirTemas;
exports.gerarRoteiro = roteiros.gerarRoteiro;
require('./ia/respostasFalsas'); // só tem efeito nos emuladores com IA_FAKE=1

// Callable mínima usada para verificar o middleware do cliente (status ativo).
// As próximas fases trocam isto pelas functions reais (gerarRoteiro etc.).
const { callableCliente } = require('./lib/middleware');
exports.clienteVerificarAcesso = callableCliente(async (_req, { cliente }) => ({
  ok: true,
  nome: cliente.nome,
}));
