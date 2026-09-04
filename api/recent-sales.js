// GET /api/recent-sales
// Retorna { sales: [] } sempre que a feature não estiver pronta (flag desligada, KV não
// conectado) ou não houver vendas reais recentes — nunca inventa vendas.
// Cada item vem só com { id, city, state, product, at }, gravado pelo webhook
// (api/webhook/wiapy.js) a partir de uma compra realmente aprovada. Sem nome, e-mail,
// telefone, documento ou endereço — o frontend nunca acessa a API da Wiapy diretamente.

var kv = require('./_lib/kv');

var SALES_KEY = 'promo:recent_sales';
var MAX_RETURN = 10;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  var enabled = process.env.SALES_FEED_ENABLED === 'true';
  if (!enabled || !kv.isConfigured()) {
    return res.status(200).json({ sales: [] });
  }

  var raw = await kv.kvCommand(['lrange', SALES_KEY, '0', String(MAX_RETURN - 1)]);
  var sales = (raw || [])
    .map(function (item) {
      try { return JSON.parse(item); } catch (err) { return null; }
    })
    .filter(Boolean);

  return res.status(200).json({ sales: sales });
};
