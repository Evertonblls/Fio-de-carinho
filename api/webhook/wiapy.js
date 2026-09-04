// POST /api/webhook/wiapy
//
// Recebe o evento de compra aprovada da Wiapy, valida a autenticidade da requisição e,
// só então, atualiza remainingBonusSlots e o feed de vendas recentes usados pelo site.
// O frontend nunca fala direto com a Wiapy — só com esta rota (indiretamente, via
// /api/offer-status e /api/recent-sales).
//
// ATENÇÃO — PENDÊNCIAS A CONFIRMAR NA DOCUMENTAÇÃO OFICIAL DA WIAPY ANTES DE ATIVAR:
//   1) Nome do header de assinatura e o algoritmo usado por eles. Abaixo assumimos
//      HMAC-SHA256 do corpo bruto (hex) no header "x-wiapy-signature" — é um padrão
//      comum, mas PRECISA ser conferido com o provedor antes de ligar SALES_FEED_ENABLED.
//   2) Nomes exatos dos campos no payload (status do pagamento, nome do produto,
//      cidade/estado do cliente). Os nomes usados abaixo são um palpite razoável e
//      DEVEM ser validados contra um evento real de teste da própria Wiapy.
//   3) Se a Wiapy oferecer um evento de teste/replay no painel deles, use-o para validar
//      esta rota antes de apontar o webhook de produção para cá.
//
// Enquanto SALES_FEED_ENABLED não estiver "true", esta rota responde 503 e não grava nada.

var crypto = require('crypto');
var kv = require('../_lib/kv');

var SLOTS_KEY = 'promo:remaining_slots';
var SALES_KEY = 'promo:recent_sales';
var SALES_KEPT = 20;

function isValidSignature(rawBody, signatureHeader) {
  var secret = process.env.SALES_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  var expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  var a = Buffer.from(expected);
  var b = Buffer.from(String(signatureHeader));
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (process.env.SALES_FEED_ENABLED !== 'true') return res.status(503).json({ error: 'disabled' });
  if (!kv.isConfigured()) return res.status(503).json({ error: 'kv not configured' });

  var rawBody = JSON.stringify(req.body || {});
  var signature = req.headers['x-wiapy-signature'];
  if (!isValidSignature(rawBody, signature)) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  var event = req.body || {};
  var status = event.status || event.payment_status || '';
  var productName = (event.product && event.product.name) || event.product_name || '';
  var isApproved = ['paid', 'approved', 'aprovado'].indexOf(String(status).toLowerCase()) !== -1;

  if (!isApproved) {
    // Outros status (pendente, recusado, estornado etc.) são recebidos mas ignorados.
    return res.status(200).json({ ignored: true });
  }

  var isCompleta = /completa/i.test(productName);

  // Só estado/cidade, quando existir — nunca nome completo, e-mail, telefone,
  // documento ou endereço. Trunca defensivamente o tamanho de qualquer string recebida.
  var customer = event.customer || {};
  var city = typeof customer.city === 'string' ? customer.city.slice(0, 60) : null;
  var state = typeof customer.state === 'string' ? customer.state.slice(0, 2) : null;

  if (isCompleta) {
    var remaining = await kv.kvCommand(['get', SLOTS_KEY]);
    var n = Math.max(0, (parseInt(remaining, 10) || 0) - 1);
    await kv.kvCommand(['set', SLOTS_KEY, String(n)]);
  }

  var entry = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    city: city,
    state: state,
    product: isCompleta ? 'completa' : 'essencial',
    at: Date.now(),
  };
  await kv.kvCommand(['lpush', SALES_KEY, JSON.stringify(entry)]);
  await kv.kvCommand(['ltrim', SALES_KEY, '0', String(SALES_KEPT - 1)]);

  return res.status(200).json({ ok: true });
};
