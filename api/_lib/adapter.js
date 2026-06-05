const { handler: netlifyHandler } = require("../../netlify/functions/api.js");

const processedWhatsAppMessageIds = globalThis.__processedWhatsAppMessageIds || new Set();
globalThis.__processedWhatsAppMessageIds = processedWhatsAppMessageIds;

function toEvent(req) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const body =
    typeof req.body === "string"
      ? req.body
      : req.body
        ? JSON.stringify(req.body)
        : "";

  return {
    httpMethod: req.method,
    path: url.pathname,
    headers: req.headers || {},
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body
  };
}

function isWhatsAppWebhook(event) {
  return event.path === "/api/whatsapp/webhook" || event.path === "/.netlify/functions/api/whatsapp/webhook";
}

function whatsappMessages(body) {
  return (body.entry || [])
    .flatMap((entry) => entry.changes || [])
    .flatMap((change) => change.value?.messages || [])
    .filter((message) => message?.id);
}

function pruneProcessedWhatsAppIds() {
  while (processedWhatsAppMessageIds.size > 100) {
    const oldest = processedWhatsAppMessageIds.values().next().value;
    processedWhatsAppMessageIds.delete(oldest);
  }
}

function filterWhatsAppWebhook(event) {
  if (event.httpMethod === "GET") {
    const challenge = event.queryStringParameters?.["hub.challenge"];
    if (event.queryStringParameters?.["hub.mode"] === "subscribe" && challenge) {
      return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body: String(challenge) };
    }
    return null;
  }

  if (event.httpMethod !== "POST" || !event.body) return null;

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const messages = whatsappMessages(body);
  if (!messages.length) return null;

  const freshMessages = messages.filter((message) => {
    const age = message.timestamp ? now - Number(message.timestamp) : 0;
    if (age > 300) return false;
    if (processedWhatsAppMessageIds.has(message.id)) return false;
    processedWhatsAppMessageIds.add(message.id);
    return true;
  });
  pruneProcessedWhatsAppIds();

  if (!freshMessages.length) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, processed: 0, skipped: true, reason: "duplicate_or_stale_whatsapp_message" })
    };
  }

  const freshIds = new Set(freshMessages.map((message) => message.id));
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (Array.isArray(change.value?.messages)) {
        change.value.messages = change.value.messages.filter((message) => !message.id || freshIds.has(message.id));
      }
    }
  }
  event.body = JSON.stringify(body);
  return null;
}

async function handle(req, res) {
  const event = toEvent(req);
  const earlyResponse = isWhatsAppWebhook(event) ? filterWhatsAppWebhook(event) : null;
  const result = earlyResponse || await netlifyHandler(event);
  res.statusCode = result.statusCode || 200;
  for (const [key, value] of Object.entries(result.headers || {})) {
    res.setHeader(key, value);
  }
  res.end(result.body || "");
}

module.exports = { handle };
