const { handler: netlifyHandler } = require("../../netlify/functions/api.js");

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

async function handle(req, res) {
  const result = await netlifyHandler(toEvent(req));
  res.statusCode = result.statusCode || 200;
  for (const [key, value] of Object.entries(result.headers || {})) {
    res.setHeader(key, value);
  }
  res.end(result.body || "");
}

module.exports = { handle };
