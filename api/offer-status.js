// GET /api/offer-status
// Retorna { configured: false } sempre que a feature não estiver pronta (flag desligada,
// KV não conectado, ou TOTAL_BONUS_SLOTS ausente) — nunca inventa um número de vagas.
// Quando configurado de verdade, retorna { configured: true, remainingBonusSlots: N },
// onde N só muda quando o webhook (api/webhook/wiapy.js) registrar uma compra aprovada
// da Biblioteca Completa. Não há redução por tempo nem por acesso repetido à página.

var kv = require('./_lib/kv');

var SLOTS_KEY = 'promo:remaining_slots';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  var enabled = process.env.SALES_FEED_ENABLED === 'true';
  var total = parseInt(process.env.TOTAL_BONUS_SLOTS || '', 10);

  if (!enabled || !kv.isConfigured() || !Number.isFinite(total)) {
    return res.status(200).json({ configured: false });
  }

  var remaining = await kv.kvCommand(['get', SLOTS_KEY]);
  if (remaining === null) {
    // Primeira leitura depois de configurar: inicializa com o total, sem sobrescrever
    // se outra requisição já tiver inicializado (setnx = só define se a chave não existir).
    await kv.kvCommand(['setnx', SLOTS_KEY, String(total)]);
    remaining = await kv.kvCommand(['get', SLOTS_KEY]);
  }

  if (remaining === null) {
    // KV respondeu, mas não foi possível ler/inicializar — não simula, apenas some.
    return res.status(200).json({ configured: false });
  }

  var n = Math.max(0, parseInt(remaining, 10) || 0);
  return res.status(200).json({ configured: true, remainingBonusSlots: n });
};
