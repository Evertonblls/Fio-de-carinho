// Cliente mínimo para o Vercel KV (protocolo REST compatível com Upstash), via fetch puro —
// sem dependência de pacote, para não introduzir build step neste projeto estático.
//
// Requer as variáveis KV_REST_API_URL e KV_REST_API_TOKEN, injetadas automaticamente pela
// Vercel quando um KV Store é conectado ao projeto (Storage > Create Database > KV).
//
// Nunca lança erro para quem chama: se não estiver configurado, ou se o comando falhar,
// retorna null — o chamador decide o estado seguro (ex.: "não configurado").

function isConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kvCommand(parts) {
  if (!isConfigured()) return null;
  var url = process.env.KV_REST_API_URL + '/' + parts.map(encodeURIComponent).join('/');
  try {
    var res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + process.env.KV_REST_API_TOKEN },
    });
    if (!res.ok) return null;
    var data = await res.json();
    return data.result;
  } catch (err) {
    return null;
  }
}

module.exports = { isConfigured: isConfigured, kvCommand: kvCommand };
