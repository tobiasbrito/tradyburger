const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-password",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"
};

const orderStatuses = new Set(["pendiente", "confirmado", "preparado", "entregado", "cancelado"]);

function response(statusCode, body) {
  return { statusCode, headers: jsonHeaders, body: JSON.stringify(body) };
}

function textResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" },
    body: String(body || "")
  };
}

function requireEnv() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return { url: SUPABASE_URL.replace(/\/$/, ""), key: SUPABASE_SERVICE_ROLE_KEY };
}

function isAdmin(event) {
  const configured = process.env.ADMIN_PASSWORD;
  const provided = event.headers["x-admin-password"] || event.headers["X-Admin-Password"];
  return Boolean(configured && provided && configured === provided);
}

async function supabase(table, options = {}) {
  const env = requireEnv();
  const query = options.query ? `?${options.query}` : "";
  const res = await fetch(`${env.url}/rest/v1/${table}${query}`, {
    method: options.method || "GET",
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = payload?.message || payload?.hint || text || `Supabase ${res.status}`;
    throw new Error(message);
  }
  return payload;
}

function routeFromPath(path) {
  const marker = "/api";
  const idx = path.indexOf(marker);
  if (idx >= 0) return path.slice(idx + marker.length).replace(/^\/+/, "");
  const fnMarker = "/.netlify/functions/api";
  const fnIdx = path.indexOf(fnMarker);
  if (fnIdx >= 0) return path.slice(fnIdx + fnMarker.length).replace(/^\/+/, "");
  return "";
}

function groupProducts(products) {
  const map = new Map();
  for (const product of products) {
    const category = product.category || "Menu";
    if (!map.has(category)) map.set(category, { name: category, items: [] });
    map.get(category).items.push(product);
  }
  return Array.from(map.values());
}

function money(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

const orderMetaPattern = /\n\n\[admin_meta:(\{.*\})\]$/s;
const settingsMetaPattern = /\n\n\[settings_meta:(\{.*\})\]$/s;

function parseOrderMeta(notes = "") {
  const match = String(notes || "").match(orderMetaPattern);
  if (!match) return { cleanNotes: notes || "", meta: {} };
  try {
    return {
      cleanNotes: String(notes || "").replace(orderMetaPattern, ""),
      meta: JSON.parse(match[1])
    };
  } catch {
    return { cleanNotes: notes || "", meta: {} };
  }
}

function withOrderMeta(notes = "", patch = {}) {
  const current = parseOrderMeta(notes);
  const meta = {
    ...current.meta,
    ...(patch.is_paid !== undefined ? { is_paid: Boolean(patch.is_paid) } : {}),
    ...(patch.delivery_driver !== undefined ? { delivery_driver: patch.delivery_driver || "" } : {}),
    ...(patch.cashier_name !== undefined ? { cashier_name: patch.cashier_name || "" } : {})
  };
  return `${current.cleanNotes || ""}\n\n[admin_meta:${JSON.stringify(meta)}]`;
}

function decorateOrder(order) {
  const { cleanNotes, meta } = parseOrderMeta(order.notes || "");
  return {
    ...order,
    notes: cleanNotes,
    is_paid: order.is_paid !== undefined && order.is_paid !== null ? Boolean(order.is_paid) : Boolean(meta.is_paid),
    delivery_driver: order.delivery_driver !== undefined && order.delivery_driver !== null ? order.delivery_driver : meta.delivery_driver || "",
    cashier_name: order.cashier_name !== undefined && order.cashier_name !== null ? order.cashier_name : meta.cashier_name || ""
  };
}

function parseSettingsMeta(openingHours = "") {
  const match = String(openingHours || "").match(settingsMetaPattern);
  if (!match) return { cleanOpeningHours: openingHours || "", meta: {} };
  try {
    return {
      cleanOpeningHours: String(openingHours || "").replace(settingsMetaPattern, ""),
      meta: JSON.parse(match[1])
    };
  } catch {
    return { cleanOpeningHours: openingHours || "", meta: {} };
  }
}

function withSettingsMeta(settings, patch = {}) {
  const current = parseSettingsMeta(settings.opening_hours || "");
  const meta = {
    ...current.meta,
    ...(patch.delivery_drivers !== undefined ? { delivery_drivers: patch.delivery_drivers } : {}),
    ...(patch.cashiers !== undefined ? { cashiers: patch.cashiers } : {}),
    ...(patch.orders_cleared_at !== undefined ? { orders_cleared_at: patch.orders_cleared_at || "" } : {})
  };
  return `${current.cleanOpeningHours || ""}\n\n[settings_meta:${JSON.stringify(meta)}]`;
}

function decorateSettings(settings) {
  const current = parseSettingsMeta(settings.opening_hours || "");
  return {
    ...settings,
    opening_hours: current.cleanOpeningHours,
    delivery_drivers: Array.isArray(current.meta.delivery_drivers) ? current.meta.delivery_drivers : [],
    cashiers: Array.isArray(current.meta.cashiers) ? current.meta.cashiers : [],
    orders_cleared_at: current.meta.orders_cleared_at || ""
  };
}

function buildWhatsAppSummary(order, items, settings) {
  const cleanNotes = parseOrderMeta(order.notes || "").cleanNotes;
  const lines = [
    `Nuevo pedido ${settings.business_name}`,
    "",
    ...items.map((item) => `- ${item.quantity} x ${item.product_name} (${money(item.unit_price)} c/u)`),
    "",
    `Total: ${money(order.total)}`,
    `Cliente: ${order.customer_name}`,
    `Telefono: ${order.customer_phone || "No informado"}`,
    `Entrega: ${order.delivery_type}`,
    `Direccion: ${order.address || "Retiro en local"}`,
    `Pago: ${order.payment_method}`,
    `Notas: ${cleanNotes || "Sin notas"}`,
    "",
    `Pedido guardado: ${order.id}`
  ];
  return lines.join("\n");
}

async function getActiveProducts() {
  return supabase("products", {
    query: "select=*&is_active=eq.true&order=created_at.asc"
  });
}

async function getAllProducts() {
  return supabase("products", {
    query: "select=*&order=created_at.asc"
  });
}

async function getSettings() {
  const rows = await supabase("settings", { query: "select=*&limit=1" });
  const fallback = {
    business_name: "Tradi Burgerrr",
    whatsapp_number: "5491162588633",
    address: "Fraga 2900 - B. San Eduardo - Merlo",
    opening_hours: "Lunes a Domingo 20hs a 23:45hs",
    delivery_enabled: true,
    delivery_cost: 0,
    delivery_drivers: [],
    cashiers: [],
    orders_cleared_at: ""
  };
  return rows[0] ? decorateSettings(rows[0]) : fallback;
}

function botMenuText(categories) {
  return categories.map((category, index) => `${index + 1}. ${category.name}`).join("\n");
}

function botProductText(category) {
  return category.items.map((product, index) => `${index + 1}. ${product.name} - ${money(product.price)}`).join("\n");
}

function botCartSummary(cart) {
  const lines = cart.map((item) => `- ${item.quantity} x ${item.product.name} (${money(item.product.price)} c/u)`);
  const total = cart.reduce((sum, item) => sum + item.quantity * item.product.price, 0);
  return cart.length ? `${lines.join("\n")}\n\nTotal estimado: ${money(total)}` : "Todavia no agregaste productos.";
}

function botWelcomeText(settings, categories) {
  return `Hola! Soy Tradi, el bot de pedidos de ${settings.business_name}.\n\nTe paso el menu para arrancar. Elegi una categoria por numero o por nombre:\n\n${botMenuText(categories)}\n\nEjemplo: escribi "2" para Dobles, o "bebidas".`;
}

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textTokens(value = "") {
  return normalizeText(value).split(" ").filter((token) => token.length > 1);
}

function expandCommonFoodTypos(text = "") {
  const normalized = normalizeText(text);
  const replacements = [
    [/\b(nuget|nuguet|nugget|nuggets|nuguets|nuges|nugets)\b/g, "nuggets"],
    [/\b(ches|chees|cheese|chesse|chese)\b/g, "chesse"],
    [/\b(amburguesa|amburgesa|hamburgesa|hamburguesa|burga|burger)\b/g, "hamburguesa"],
    [/\b(papa|papas|frita|fritas)\b/g, "papas"],
    [/\b(coca|cocacola|cocaa)\b/g, "coca"],
    [/\b(chedar|chedar|chedder|cheddar)\b/g, "cheddar"],
    [/\b(mila|milanesa|milanga)\b/g, "milanesa"]
  ];
  return replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), normalized);
}

function parseYesNo(text) {
  const normalized = normalizeText(text);
  if (/^(si|s|dale|ok|oka|confirmo|confirmar|mandalo|listo|de una)\b/.test(normalized)) return true;
  if (/^(no|n|cancelar|cancela|mejor no|negativo)\b/.test(normalized)) return false;
  return null;
}

function parseQuantity(text) {
  const normalized = normalizeText(text);
  const words = { uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
  const number = normalized.match(/\b\d+\b/);
  if (number) return Math.max(1, Number.parseInt(number[0], 10));
  const word = normalized.split(" ").find((token) => words[token]);
  return words[word] || 1;
}

function parseLastQuantity(text) {
  const normalized = normalizeText(text);
  const words = { uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
  const numbers = normalized.match(/\b\d+\b/g);
  if (numbers?.length) return Math.max(1, Number.parseInt(numbers[numbers.length - 1], 10));
  const word = normalized.split(" ").reverse().find((token) => words[token]);
  return words[word] || 1;
}

function parseDeliveryType(text) {
  const normalized = normalizeText(text);
  if (/(envio|delivery|mandamelo|llevar|domicilio|casa)/.test(normalized)) return "envio";
  if (/(retiro|retira|paso|local|buscar)/.test(normalized)) return "retiro";
  return null;
}

function parsePayment(text) {
  const normalized = normalizeText(text);
  if (/(mercado|mp)/.test(normalized)) return "Mercado Pago";
  if (/(trans|tranfe|transfer|alias|cvu)/.test(normalized)) return "Transferencia";
  if (/(efectivo|cash)/.test(normalized)) return "Efectivo";
  return text.trim();
}

function extractAddressNumber(text = "") {
  const match = String(text).match(/\b\d{1,6}\b/);
  return match ? match[0] : "";
}

function stripAddressNumber(text = "") {
  return String(text || "")
    .replace(/\b\d{1,6}\b/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOptionalReference(text = "") {
  const normalized = normalizeText(text);
  if (/^(no|sin|ninguna|ninguno|no tengo|no se)\b/.test(normalized)) return "";
  return String(text || "").trim();
}

function formatDeliveryAddress(state = {}) {
  const parts = [];
  const streetLine = [state.address_street, state.address_number].filter(Boolean).join(" ").trim();
  if (streetLine) parts.push(streetLine);
  else if (state.address) parts.push(state.address);
  if (state.address_cross) parts.push(`Entre calles: ${state.address_cross}`);
  if (state.address_reference) parts.push(`Referencia: ${state.address_reference}`);
  return parts.join(" | ");
}

function editDistance(a = "", b = "") {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function tokenLooksLike(token, candidate) {
  if (!token || !candidate) return false;
  if (candidate.includes(token) || token.includes(candidate)) return true;
  if (token.length < 4 || candidate.length < 4) return false;
  const distance = editDistance(token, candidate);
  const allowed = Math.max(1, Math.floor(Math.min(token.length, candidate.length) / 4));
  return distance <= allowed;
}

function productScore(product, tokens) {
  const name = normalizeText(product.name);
  const description = normalizeText(product.description || "");
  const searchableTokens = textTokens(`${product.name} ${product.description || ""}`);
  return tokens.reduce((score, token) => {
    if (name.includes(token)) return score + 4;
    if (searchableTokens.some((candidate) => tokenLooksLike(token, candidate))) return score + 3;
    if (token.length >= 4 && description.includes(token)) return score + 1;
    return score;
  }, 0);
}

function findCategory(text, categories) {
  const numeric = Number.parseInt(text, 10);
  if (Number.isFinite(numeric) && categories[numeric - 1]) return categories[numeric - 1];
  const normalized = expandCommonFoodTypos(text);
  if (!normalized) return null;
  const exact = categories.find((category) => {
    const categoryName = normalizeText(category.name);
    return categoryName.includes(normalized) || normalized.includes(categoryName);
  });
  if (exact) return exact;

  const tokens = textTokens(expandCommonFoodTypos(text));
  return categories.find((category) => {
    const categoryTokens = textTokens(category.name);
    return tokens.some((token) => categoryTokens.some((candidate) => tokenLooksLike(token, candidate)));
  });
}

function isExactCategoryMatch(text, category, categories) {
  if (!category) return false;
  const numeric = Number.parseInt(text, 10);
  if (Number.isFinite(numeric) && categories[numeric - 1]?.name === category.name) return true;
  const normalized = expandCommonFoodTypos(text.replace(/^ver\s+/, ""));
  const categoryName = normalizeText(category.name);
  return categoryName.includes(normalized) || normalized.includes(categoryName);
}

function findProduct(text, products, category) {
  const numeric = Number.parseInt(text, 10);
  if (Number.isFinite(numeric) && category?.items?.[numeric - 1]) return category.items[numeric - 1];

  const scope = category?.items?.length ? category.items : products;
  const ignored = new Set([
    "quiero",
    "queria",
    "agrega",
    "agregar",
    "sumame",
    "pone",
    "dame",
    "pedir",
    "pedido",
    "con",
    "sin",
    "solo",
    "solamente",
    "para",
    "por",
    "del",
    "de",
    "la",
    "el",
    "los",
    "las",
    "un",
    "una",
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "unidad",
    "unidades",
    "hamburguesa",
    "hamburgesa",
    "amburguesa",
    "hamburguesas",
    "amburguesas"
  ]);
  const tokens = textTokens(expandCommonFoodTypos(text)).filter((token) => !ignored.has(token));
  if (!tokens.length) return null;
  const matches = scope
    .map((product) => ({ product, score: productScore(product, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.length - b.product.name.length);
  return matches[0]?.product || null;
}

function addToCart(cart, product, quantity) {
  const existing = cart.find((item) => item.product.id === product.id);
  if (existing) existing.quantity += quantity;
  else cart.push({ product, quantity });
}

function handleCartCorrection(text, cart, products) {
  const normalized = normalizeText(text);
  const wantsCorrection = /(me equivoque|corregi|corregir|cambia|cambiar|solo quiero|no quiero|quise decir|en realidad|baja|subi|cantidad)/.test(normalized);
  if (!wantsCorrection || !cart.length) return "";

  const mentionedProduct = findProduct(text, products);
  let item = mentionedProduct
    ? cart.find((cartItem) => cartItem.product.id === mentionedProduct.id)
    : cart[cart.length - 1];
  if (!item) item = cart[cart.length - 1];
  if (!item) return "Te sigo, pero todavia no encontre productos en tu carrito. Decime que queres pedir.";

  if (/(saca|sacalo|quitar|quita|borrar|borra|eliminar|elimina)/.test(normalized) && !/(solo quiero|quiero \d|quiero una|quiero uno)/.test(normalized)) {
    const index = cart.findIndex((cartItem) => cartItem.product.id === item.product.id);
    cart.splice(index, 1);
    return `Listo, saque ${item.product.name} del pedido.\n\n${botCartSummary(cart)}\n\nSeguimos?`;
  }

  const quantity = parseLastQuantity(text);
  item.quantity = quantity;
  return `Listo, corregido: queda ${quantity} x ${item.product.name}.\n\n${botCartSummary(cart)}\n\nAlgo mas?`;
}

function isGreeting(text) {
  return /^(hola|buenas|buen dia|buenas tardes|buenas noches|hey|holi)\b/.test(normalizeText(text));
}

function cleanPhone(phone = "") {
  return String(phone).replace(/\D/g, "");
}

function whatsappRecipientCandidates(phone = "") {
  const cleaned = cleanPhone(phone);
  const candidates = [cleaned];
  if (cleaned.startsWith("54911")) candidates.push(`5411${cleaned.slice(5)}`);
  return [...new Set(candidates.filter(Boolean))];
}

function isWhatsappAdmin(phone) {
  const admins = String(process.env.WHATSAPP_ADMIN_NUMBERS || "")
    .split(",")
    .map(cleanPhone)
    .filter(Boolean);
  return admins.includes(cleanPhone(phone));
}

async function getBotSession(sessionId, customerPhone = "") {
  if (sessionId) {
    const rows = await supabase("bot_sessions", {
      query: `select=*&id=eq.${encodeURIComponent(sessionId)}&limit=1`
    });
    if (rows[0]) return rows[0];
  }
  if (customerPhone) {
    const rows = await supabase("bot_sessions", {
      query: `select=*&customer_phone=eq.${encodeURIComponent(cleanPhone(customerPhone))}&order=updated_at.desc&limit=1`
    });
    if (rows[0]) return rows[0];
  }
  return (await supabase("bot_sessions", {
    method: "POST",
    body: { customer_phone: cleanPhone(customerPhone), step: "category", state: {}, cart: [], last_message: "session_started" }
  }))[0];
}

async function saveBotSession(session) {
  const rows = await supabase("bot_sessions", {
    method: "PATCH",
    query: `id=eq.${encodeURIComponent(session.id)}`,
    body: {
      customer_phone: session.customer_phone || "",
      step: session.step,
      state: session.state || {},
      cart: session.cart || [],
      last_message: session.last_message || ""
    }
  });
  return rows[0];
}

function splitWhatsAppText(text) {
  const value = String(text || "");
  const chunks = [];
  for (let i = 0; i < value.length; i += 3500) chunks.push(value.slice(i, i + 3500));
  return chunks.length ? chunks : [""];
}

async function sendWhatsAppText(to, text) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || "v24.0";
  if (!token || !phoneNumberId || !to) return { sent: false, reason: "WhatsApp env vars missing" };

  const results = [];
  for (const chunk of splitWhatsAppText(text)) {
    let lastError = null;
    for (const candidate of whatsappRecipientCandidates(to)) {
      const res = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: candidate,
          type: "text",
          text: { preview_url: false, body: chunk }
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        results.push(payload);
        lastError = null;
        break;
      }
      lastError = payload?.error?.message || `WhatsApp send ${res.status}`;
    }
    if (lastError) throw new Error(lastError);
  }
  return { sent: true, results };
}

async function sendLocalNotification(text, excludePhone = "") {
  const settings = await getSettings();
  const notifyNumber = cleanPhone(
    process.env.LOCAL_WHATSAPP_NUMBER ||
    process.env.WHATSAPP_LOCAL_NOTIFY_NUMBER ||
    settings.whatsapp_number
  );
  if (!notifyNumber || notifyNumber === cleanPhone(excludePhone)) return { sent: false, reason: "No separate notify number" };
  return sendWhatsAppText(notifyNumber, text);
}

function envStatus() {
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ADMIN_PASSWORD",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_VERIFY_TOKEN",
    "LOCAL_WHATSAPP_NUMBER",
    "WHATSAPP_LOCAL_NOTIFY_NUMBER",
    "WHATSAPP_GRAPH_VERSION"
  ];
  return Object.fromEntries(keys.map((key) => [key, Boolean(process.env[key])]));
}

function extractWhatsAppMessages(body) {
  const messages = [];
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const message of value.messages || []) {
        messages.push({
          from: cleanPhone(message.from),
          id: message.id,
          type: message.type,
          text: message.text?.body || ""
        });
      }
    }
  }
  return messages;
}

function detectSupportIntent(text) {
  return /(reclamo|queja|problema|demora|tarde|frio|fria|equivocado|mal pedido|falto|faltan|no llego|humano|persona)/.test(normalizeText(text));
}

async function handleInventoryCommand(phone, text) {
  if (!isWhatsappAdmin(phone)) return null;
  const normalized = normalizeText(text);
  const deactivate = /^(sin stock|pausar|desactivar|apagar)\b/.test(normalized);
  const activate = /^(con stock|activar|habilitar|volver stock)\b/.test(normalized);
  if (!deactivate && !activate) return null;

  const query = normalized.replace(/^(sin stock|pausar|desactivar|apagar|con stock|activar|habilitar|volver stock)\s*/, "");
  if (!query) return "Decime que producto queres cambiar. Ejemplo: sin stock chesse simple";

  const products = activate ? await getAllProducts() : await getActiveProducts();
  const product = findProduct(query, products);
  if (!product) return `No encontre "${query}". Probame con parte del nombre exacto del producto.`;

  const updated = await supabase("products", {
    method: "PATCH",
    query: `id=eq.${encodeURIComponent(product.id)}`,
    body: { is_active: activate }
  });
  const status = activate ? "activado" : "desactivado";
  return `${updated[0]?.name || product.name} queda ${status}. La web y el bot ya toman este cambio.`;
}

async function handleBotDemo(body) {
  const products = await getActiveProducts();
  const categories = groupProducts(products);

  if (!body.message) {
    const session = await getBotSession(body.session_id);
    session.step = "category";
    session.last_message = "saludo";
    await saveBotSession(session);
    return {
      session_id: session.id,
      step: session.step,
      reply: `Hola, soy Tradi Bot en modo demo/test.\n\nElegí una categoria:\n${botMenuText(categories)}`,
      categories
    };
  }

  const session = await getBotSession(body.session_id);
  const text = String(body.message || "").trim();
  const normalized = text.toLowerCase();
  const state = session.state || {};
  const cart = Array.isArray(session.cart) ? session.cart : [];
  let reply = "";

  if (normalized === "menu") {
    session.step = "category";
    reply = `Elegí una categoria:\n${botMenuText(categories)}`;
  } else if (session.step === "category") {
    const category = categories[Number.parseInt(text, 10) - 1];
    if (!category) {
      reply = `No encontre esa categoria. Proba con:\n${botMenuText(categories)}`;
    } else {
      state.category = category.name;
      session.step = "product";
      reply = `Categoria: ${category.name}\nElegí producto:\n${botProductText(category)}\n\nEscribí "menu" para volver.`;
    }
  } else if (session.step === "product") {
    const category = categories.find((item) => item.name === state.category);
    const product = category?.items[Number.parseInt(text, 10) - 1];
    if (!product) {
      reply = "No encontre ese producto. Proba con otro numero.";
    } else {
      state.pending_product_id = product.id;
      session.step = "quantity";
      reply = `Cuantas unidades de "${product.name}" queres agregar?`;
    }
  } else if (session.step === "quantity") {
    const product = products.find((item) => item.id === state.pending_product_id);
    const quantity = Math.max(1, Number.parseInt(text, 10) || 1);
    cart.push({ product, quantity });
    delete state.pending_product_id;
    session.step = "more";
    reply = `Agregado.\n\n${botCartSummary(cart)}\n\nQueres sumar algo mas? Responde "si" o "no".`;
  } else if (session.step === "more") {
    if (normalized.startsWith("s")) {
      session.step = "category";
      reply = `Elegí una categoria:\n${botMenuText(categories)}`;
    } else {
      session.step = "name";
      reply = "Perfecto. Decime el nombre del cliente.";
    }
  } else if (session.step === "name") {
    state.customer_name = text;
    session.step = "phone";
    reply = "Telefono del cliente? Si no queres cargarlo, escribi no.";
  } else if (session.step === "phone") {
    state.customer_phone = normalized === "no" ? "" : text;
    session.customer_phone = state.customer_phone;
    session.step = "delivery";
    reply = "El pedido es para retiro o envio?";
  } else if (session.step === "delivery") {
    state.delivery_type = normalized.includes("env") ? "envio" : "retiro";
    if (state.delivery_type === "envio") {
      session.step = "address";
      reply = "Perfecto, pasame la calle y numero para el envio.";
    } else {
      session.step = "payment";
      reply = "Forma de pago: efectivo, transferencia o Mercado Pago?";
    }
  } else if (session.step === "address") {
    state.address_number = extractAddressNumber(text);
    state.address_street = state.address_number ? stripAddressNumber(text) : text;
    state.address = formatDeliveryAddress(state);
    if (!state.address_number) {
      session.step = "address_number";
      reply = "Me pasas la altura o numero de la casa? Despues te pido las entre calles.";
    } else {
      session.step = "address_cross";
      reply = "Gracias. Ahora pasame las entre calles. Ejemplo: entre Jose Marti y Arevalo.";
    }
  } else if (session.step === "address_number") {
    state.address_number = extractAddressNumber(text) || text;
    state.address = formatDeliveryAddress(state);
    session.step = "address_cross";
    reply = "Perfecto. Pasame las entre calles. Ejemplo: entre Jose Marti y Arevalo.";
  } else if (session.step === "address_cross") {
    state.address_cross = text;
    state.address = formatDeliveryAddress(state);
    session.step = "address_reference";
    reply = "Tenes alguna referencia para el repartidor? Ejemplo: porton negro, casa de rejas, kiosco enfrente. Si no tenes, escribi no.";
  } else if (session.step === "address_reference") {
    state.address_reference = normalizeOptionalReference(text);
    state.address = formatDeliveryAddress(state);
    session.step = "payment";
    reply = `Direccion anotada: ${state.address}\n\nForma de pago: efectivo, transferencia o Mercado Pago?`;
  } else if (session.step === "payment") {
    state.payment_method = text;
    session.step = "confirm";
    reply = `Resumen final:\n${botCartSummary(cart)}\n\nCliente: ${state.customer_name}\nTelefono: ${state.customer_phone || "No informado"}\nEntrega: ${state.delivery_type}\nDireccion: ${state.address || "Retiro en local"}\nPago: ${state.payment_method}\n\nConfirmas el pedido? Responde "si" o "no".`;
  } else if (session.step === "confirm") {
    if (!normalized.startsWith("s")) {
      session.step = "done";
      reply = "Pedido cancelado en demo.";
    } else {
      const orderResult = await createOrderFromItems({
        customer_name: state.customer_name,
        customer_phone: state.customer_phone || "",
        delivery_type: state.delivery_type,
        address: state.address || "",
        payment_method: state.payment_method || "Efectivo",
        notes: "Pedido tomado por /api/bot/demo",
        items: cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity }))
      });
      session.step = "done";
      state.order_id = orderResult.order.id;
      reply = `Pedido guardado.\n\n${orderResult.summary}`;
    }
  } else {
    reply = "La sesion ya termino. Inicia otra sin session_id para un nuevo pedido.";
  }

  session.state = state;
  session.cart = cart;
  session.last_message = text;
  await saveBotSession(session);
  return { session_id: session.id, step: session.step, reply };
}

async function handleSmartBotDemo(body) {
  const products = await getActiveProducts();
  const categories = groupProducts(products);
  const settings = await getSettings();
  const channel = body.channel || "demo";
  const customerPhone = cleanPhone(body.customer_phone || "");

  if (!body.message) {
    const session = await getBotSession(body.session_id, customerPhone);
    session.step = "category";
    session.state = {};
    session.cart = [];
    session.customer_phone = customerPhone || session.customer_phone || "";
    session.last_message = "saludo";
    await saveBotSession(session);
    return {
      session_id: session.id,
      step: session.step,
      reply: botWelcomeText(settings, categories),
      categories
    };
  }

  const session = await getBotSession(body.session_id, customerPhone);
  const text = String(body.message || "").trim();
  const normalized = normalizeText(text);
  const state = session.state || {};
  const cart = Array.isArray(session.cart) ? session.cart : [];
  let reply = "";
  if (customerPhone) session.customer_phone = customerPhone;

  const inventoryReply = await handleInventoryCommand(customerPhone, text);
  if (inventoryReply) {
    session.last_message = text;
    await saveBotSession(session);
    return { session_id: session.id, step: session.step, reply: inventoryReply };
  }

  if (channel === "whatsapp" && detectSupportIntent(text) && session.step === "category") {
    await sendLocalNotification(`Atencion/reclamo por WhatsApp\nCliente: ${customerPhone || "sin telefono"}\nMensaje: ${text}`, customerPhone).catch(() => null);
    session.last_message = text;
    await saveBotSession(session);
    return {
      session_id: session.id,
      step: session.step,
      reply: "Te escucho. Ya avise al local para que lo revisen. Contame con mas detalle que paso y, si es sobre un pedido, pasame nombre o direccion."
    };
  }

  if (session.last_message === "session_started" && session.step === "category" && !cart.length) {
    session.last_message = text;
    await saveBotSession({ ...session, state, cart });
    return { session_id: session.id, step: session.step, reply: botWelcomeText(settings, categories) };
  }

  if (["ayuda", "help"].includes(normalized)) {
    reply = `Te doy una mano:\n- Escribi una categoria: "bebidas", "dobles", "nuggets"\n- Pedi directo: "2 chesse simple" o "una coca"\n- Escribi "carrito" para ver tu pedido\n- Escribi "menu" para volver al menu\n- Escribi "cancelar" para empezar de cero`;
  } else if (["carrito", "pedido", "resumen"].includes(normalized)) {
    reply = `Asi va tu pedido:\n${botCartSummary(cart)}\n\n${cart.length ? "Si esta todo, escribi no para cerrar o pedi algo mas." : "Decime que queres sumar y lo busco."}`;
  } else if (["cancelar", "cancela", "nuevo", "reiniciar", "empezar"].includes(normalized)) {
    session.step = "category";
    session.state = {};
    session.cart = [];
    session.last_message = text;
    await saveBotSession(session);
    return { session_id: session.id, step: session.step, reply: `Listo, arrancamos de cero.\n\nCategorias:\n${botMenuText(categories)}` };
  } else if (isGreeting(text) && session.step === "category" && !cart.length) {
    reply = botWelcomeText(settings, categories);
  } else if (normalized === "menu" || normalized === "ver menu") {
    session.step = "category";
    reply = `Dale, volvemos al menu.\n\nCategorias:\n${botMenuText(categories)}`;
  } else if (session.step === "category") {
    const isPlainNumber = /^\d+$/.test(normalized);
    const directProduct = isPlainNumber ? null : findProduct(text, products);
    const category = findCategory(text.replace(/^ver\s+/, ""), categories);
    const exactCategory = isExactCategoryMatch(text, category, categories);
    if (directProduct && category && !exactCategory) {
      const quantity = parseQuantity(text);
      addToCart(cart, directProduct, quantity);
      session.step = "more";
      reply = `Buenisimo, sume ${quantity} x ${directProduct.name}.\n\n${botCartSummary(cart)}\n\nQueres agregar algo mas? Podes pedirlo directo o responder "no" para cerrar.`;
    } else if (category) {
      state.category = category.name;
      if (category.items.length === 1) {
        const product = category.items[0];
        state.pending_product_id = product.id;
        session.step = "quantity";
        reply = `Categoria: ${category.name}.\nTenemos ${product.name} (${money(product.price)}).\nCuantas unidades queres?`;
      } else {
        session.step = "product";
        reply = `Categoria: ${category.name}. Elegi el producto por numero o por nombre:\n\n${botProductText(category)}\n\nCuando elijas el producto, te pregunto la cantidad.`;
      }
    } else if (directProduct) {
      const quantity = parseQuantity(text);
      addToCart(cart, directProduct, quantity);
      session.step = "more";
      reply = `Buenisimo, sume ${quantity} x ${directProduct.name}.\n\n${botCartSummary(cart)}\n\nQueres agregar algo mas? Podes pedirlo directo o responder "no" para cerrar.`;
    } else {
      reply = `No entendi esa opcion.\n\nElegi una categoria por numero o por nombre. Por ejemplo: "2", "bebidas" o "nuggets".\n\nMenu:\n${botMenuText(categories)}`;
    }
  } else if (session.step === "product") {
    const category = categories.find((item) => item.name === state.category);
    const product = findProduct(text, products, category);
    if (!product) {
      reply = `No entendi que producto queres.\n\nElegi un producto por numero o escribi parte del nombre. Tambien podes escribir "menu" para volver.`;
    } else {
      const isPlainProductNumber = /^\d+$/.test(normalized) && category?.items?.[Number.parseInt(normalized, 10) - 1];
      const hasQuantity = !isPlainProductNumber && (/\b\d+\b/.test(normalized) || /(uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)/.test(normalized));
      if (hasQuantity) {
        const quantity = parseQuantity(text);
        addToCart(cart, product, quantity);
        session.step = "more";
        reply = `Listo, adentro ${quantity} x ${product.name}.\n\n${botCartSummary(cart)}\n\nSumamos algo mas o cerramos?`;
      } else {
        state.pending_product_id = product.id;
        session.step = "quantity";
        reply = `Excelente eleccion: ${product.name} (${money(product.price)}).\nCuantas unidades queres?`;
      }
    }
  } else if (session.step === "quantity") {
    const product = products.find((item) => item.id === state.pending_product_id);
    if (!product) {
      session.step = "category";
      reply = `Se me perdio el producto pendiente. Arranquemos desde el menu:\n${botMenuText(categories)}`;
    } else {
      const quantity = parseQuantity(text);
      addToCart(cart, product, quantity);
      delete state.pending_product_id;
      session.step = "more";
      reply = `Agregado sin vueltas.\n\n${botCartSummary(cart)}\n\nQueres sumar algo mas? Pedi directo o responde "no" para cerrar.`;
    }
  } else if (session.step === "more") {
    const yesNo = parseYesNo(text);
    const correction = handleCartCorrection(text, cart, products);
    const directProduct = findProduct(text, products);
    if (correction) {
      reply = correction;
    } else if (yesNo === true) {
      session.step = "category";
      reply = `De una. Elegi categoria o pedime por nombre:\n${botMenuText(categories)}`;
    } else if (yesNo === false) {
      session.step = "name";
      reply = "Perfecto, cerramos el pedido. Decime el nombre del cliente.";
    } else if (directProduct) {
      const quantity = parseQuantity(text);
      addToCart(cart, directProduct, quantity);
      reply = `Sumado: ${quantity} x ${directProduct.name}.\n\n${botCartSummary(cart)}\n\nAlgo mas?`;
    } else {
      reply = `No entendi si queres agregar algo mas o cerrar.\n\nPodes escribir otro producto, "si" para ver el menu, "no" para cerrar, o "carrito" para revisar.`;
    }
  } else if (session.step === "name") {
    state.customer_name = text;
    if (channel === "whatsapp" && customerPhone) {
      state.customer_phone = customerPhone;
      session.customer_phone = customerPhone;
      session.step = "delivery";
      reply = `Gracias, ${state.customer_name}. Como lo hacemos: retiro por el local o envio?`;
    } else {
      session.step = "phone";
      reply = `Gracias, ${state.customer_name}. Pasame un telefono de contacto. Si no queres cargarlo, escribi "no".`;
    }
  } else if (session.step === "phone") {
    state.customer_phone = normalized === "no" ? "" : text;
    session.customer_phone = state.customer_phone;
    session.step = "delivery";
    reply = "Como lo hacemos: retiro por el local o envio?";
  } else if (session.step === "delivery") {
    const deliveryType = parseDeliveryType(text);
    if (!deliveryType) {
      reply = "No te entendi esa parte. Decime si es retiro o envio.";
    } else if (deliveryType === "envio") {
      state.delivery_type = "envio";
      session.step = "address";
      reply = "Perfecto, pasame la calle y numero para el envio.";
    } else {
      state.delivery_type = "retiro";
      session.step = "payment";
      reply = `Genial, retiro en el local: ${settings.address}.\nForma de pago: efectivo, transferencia o Mercado Pago?`;
    }
  } else if (session.step === "address") {
    state.address_number = extractAddressNumber(text);
    state.address_street = state.address_number ? stripAddressNumber(text) : text;
    state.address = formatDeliveryAddress(state);
    if (!state.address_number) {
      session.step = "address_number";
      reply = "Me pasas la altura o numero de la casa? Despues te pido las entre calles.";
    } else {
      session.step = "address_cross";
      reply = "Gracias. Ahora pasame las entre calles. Ejemplo: entre Jose Marti y Arevalo.";
    }
  } else if (session.step === "address_number") {
    state.address_number = extractAddressNumber(text) || text;
    state.address = formatDeliveryAddress(state);
    session.step = "address_cross";
    reply = "Perfecto. Pasame las entre calles. Ejemplo: entre Jose Marti y Arevalo.";
  } else if (session.step === "address_cross") {
    state.address_cross = text;
    state.address = formatDeliveryAddress(state);
    session.step = "address_reference";
    reply = "Tenes alguna referencia para el repartidor? Ejemplo: porton negro, casa de rejas, kiosco enfrente. Si no tenes, escribi no.";
  } else if (session.step === "address_reference") {
    state.address_reference = normalizeOptionalReference(text);
    state.address = formatDeliveryAddress(state);
    session.step = "payment";
    reply = `Direccion anotada: ${state.address}\n\nForma de pago: efectivo, transferencia o Mercado Pago?`;
  } else if (session.step === "payment") {
    state.payment_method = parsePayment(text);
    session.step = "confirm";
    reply = `Te dejo el resumen final:\n${botCartSummary(cart)}\n\nCliente: ${state.customer_name}\nTelefono: ${state.customer_phone || "No informado"}\nEntrega: ${state.delivery_type}\nDireccion: ${state.address || "Retiro en local"}\nPago: ${state.payment_method}\n\nConfirmas el pedido? Responde "si" para guardarlo o "no" para cancelarlo.`;
  } else if (session.step === "confirm") {
    if (parseYesNo(text) !== true) {
      session.step = "done";
      reply = "Pedido cancelado en demo. Si queres arrancar otro, escribi nuevo.";
    } else {
      const orderResult = await createOrderFromItems({
        customer_name: state.customer_name,
        customer_phone: state.customer_phone || "",
        delivery_type: state.delivery_type,
        address: state.address || "",
        payment_method: state.payment_method || "Efectivo",
        notes: channel === "whatsapp" ? "Pedido tomado por WhatsApp Bot" : "Pedido tomado por /api/bot/demo inteligente",
        items: cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity }))
      });
      session.step = "done";
      state.order_id = orderResult.order.id;
      if (channel === "whatsapp") {
        await sendLocalNotification(orderResult.summary, customerPhone).catch(() => null);
        reply = `Listo, ${state.customer_name}. Tu pedido quedo guardado.\n\nTotal: ${money(orderResult.order.total)}\nEstado: pendiente\n\nEl local ya recibio el resumen para prepararlo. Si queres armar otro pedido, escribi nuevo.`;
      } else {
        reply = `Listo, pedido guardado y listo para despacho.\n\n${orderResult.summary}\n\nSi queres armar otro pedido, escribi nuevo.`;
      }
    }
  } else {
    reply = "Esta sesion ya termino. Escribi nuevo y arrancamos otro pedido.";
  }

  session.state = state;
  session.cart = cart;
  session.last_message = text;
  await saveBotSession(session);
  return { session_id: session.id, step: session.step, reply };
}

async function handleWhatsAppWebhook(event) {
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};
    const mode = params["hub.mode"];
    const token = params["hub.verify_token"];
    const challenge = params["hub.challenge"];
    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return textResponse(200, challenge);
    }
    return textResponse(403, "Invalid verify token");
  }

  const body = event.body ? JSON.parse(event.body) : {};
  const messages = extractWhatsAppMessages(body);
  if (!messages.length) {
    console.info("WhatsApp webhook received without text messages");
  }
  const results = [];

  for (const message of messages) {
    if (!message.from) continue;
    console.info("WhatsApp inbound message", {
      from: message.from,
      message_id: message.id,
      type: message.type,
      text: message.text
    });
    if (message.type !== "text") {
      const reply = "Por ahora puedo leer mensajes de texto. Escribime el pedido y te ayudo.";
      await sendWhatsAppText(message.from, reply).catch(() => null);
      results.push({ from: message.from, type: message.type, reply });
      continue;
    }

    const bot = await handleSmartBotDemo({
      channel: "whatsapp",
      customer_phone: message.from,
      message: message.text
    });
    const result = { from: message.from, message_id: message.id, step: bot.step, reply: bot.reply };
    try {
      await sendWhatsAppText(message.from, bot.reply);
      result.sent = true;
    } catch (error) {
      result.sent = false;
      result.send_error = error.message;
      console.error("WhatsApp reply failed", result);
    }
    results.push(result);
  }

  return response(200, { ok: true, processed: results.length, results });
}

async function createOrderFromItems(body) {
  const requestedItems = Array.isArray(body.items) ? body.items : [];
  if (!requestedItems.length) throw new Error("Order needs at least one item");

  const ids = requestedItems.map((item) => item.product_id).filter(Boolean);
  const products = await supabase("products", {
    query: `select=*&id=in.(${ids.map(encodeURIComponent).join(",")})&is_active=eq.true`
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const orderItems = requestedItems
    .map((item) => ({ product: byId.get(item.product_id), quantity: Math.max(1, Number(item.quantity || 1)) }))
    .filter((item) => item.product);

  if (!orderItems.length) throw new Error("No valid active products in order");

  const settings = await getSettings();
  const subtotal = orderItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const deliveryCost = body.delivery_type === "envio" && settings.delivery_enabled ? Number(settings.delivery_cost || 0) : 0;
  const total = subtotal + deliveryCost;

  const order = (await supabase("orders", {
    method: "POST",
    body: {
      customer_name: body.customer_name,
      customer_phone: body.customer_phone || "",
      delivery_type: body.delivery_type === "envio" ? "envio" : "retiro",
      address: body.delivery_type === "envio" ? body.address || "" : "",
      payment_method: body.payment_method || "Efectivo",
      total,
      status: "pendiente",
      notes: body.notes || ""
    }
  }))[0];

  const itemRows = orderItems.map((item) => ({
    order_id: order.id,
    product_id: item.product.id,
    product_name: item.product.name,
    quantity: item.quantity,
    unit_price: item.product.price,
    subtotal: item.product.price * item.quantity
  }));
  const savedItems = await supabase("order_items", { method: "POST", body: itemRows });
  const summary = buildWhatsAppSummary(order, savedItems, settings);
  const whatsappUrl = `https://wa.me/${settings.whatsapp_number}?text=${encodeURIComponent(summary)}`;

  return { order, items: savedItems, summary, whatsapp_url: whatsappUrl };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: jsonHeaders, body: "" };

  try {
    const route = routeFromPath(event.path);
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : {};

    if (method === "GET" && route === "health") {
      requireEnv();
      return response(200, { ok: true });
    }

    if (method === "GET" && route === "diagnostics") {
      if (!isAdmin(event)) return response(401, { error: "Admin password required" });
      return response(200, { ok: true, env: envStatus() });
    }

    if (method === "GET" && route === "settings") {
      return response(200, await getSettings());
    }

    if (method === "PATCH" && route === "settings") {
      if (!isAdmin(event)) return response(401, { error: "Admin password required" });
      const current = (await supabase("settings", { query: "select=*&limit=1" }))[0];
      if (!current) return response(404, { error: "Settings not found" });
      const drivers = Array.isArray(body.delivery_drivers)
        ? body.delivery_drivers.map((item) => String(item || "").trim()).filter(Boolean)
        : undefined;
      const cashiers = Array.isArray(body.cashiers)
        ? body.cashiers.map((item) => String(item || "").trim()).filter(Boolean)
        : undefined;
      const ordersClearedAt = Object.prototype.hasOwnProperty.call(body, "orders_cleared_at")
        ? String(body.orders_cleared_at || "")
        : undefined;
      const settings = await supabase("settings", {
        method: "PATCH",
        query: `id=eq.${encodeURIComponent(current.id)}`,
        body: {
          ...(drivers !== undefined || cashiers !== undefined || ordersClearedAt !== undefined
            ? { opening_hours: withSettingsMeta(current, { delivery_drivers: drivers, cashiers, orders_cleared_at: ordersClearedAt }) }
            : {})
        }
      });
      return response(200, decorateSettings(settings[0]));
    }

    if (method === "GET" && route === "menu") {
      const activeOnly = !isAdmin(event);
      const filter = activeOnly ? "&is_active=eq.true" : "";
      const products = await supabase("products", {
        query: `select=*&order=created_at.asc${filter}`
      });
      return response(200, { settings: await getSettings(), categories: groupProducts(products) });
    }

    if (method === "GET" && route === "products") {
      const filter = isAdmin(event) ? "" : "&is_active=eq.true";
      return response(200, await supabase("products", { query: `select=*&order=created_at.asc${filter}` }));
    }

    if (method === "POST" && route === "products") {
      if (!isAdmin(event)) return response(401, { error: "Admin password required" });
      const product = await supabase("products", {
        method: "POST",
        body: {
          name: body.name,
          description: body.description || "",
          category: body.category || "Menu",
          price: Number(body.price || 0),
          image_url: body.image_url || "",
          is_active: body.is_active !== false
        }
      });
      return response(200, product[0]);
    }

    if (method === "PATCH" && route.startsWith("products/")) {
      if (!isAdmin(event)) return response(401, { error: "Admin password required" });
      const id = route.split("/")[1];
      const allowed = ["name", "description", "category", "price", "image_url", "is_active"];
      const patch = {};
      for (const key of allowed) if (Object.prototype.hasOwnProperty.call(body, key)) patch[key] = body[key];
      if (patch.price !== undefined) patch.price = Number(patch.price);
      const product = await supabase("products", {
        method: "PATCH",
        query: `id=eq.${encodeURIComponent(id)}`,
        body: patch
      });
      return response(200, product[0]);
    }

    if (method === "GET" && route === "orders") {
      if (!isAdmin(event)) return response(401, { error: "Admin password required" });
      const orders = await supabase("orders", { query: "select=*&order=created_at.desc" });
      return response(200, orders.map(decorateOrder));
    }

    if (method === "PATCH" && route.startsWith("orders/")) {
      if (!isAdmin(event)) return response(401, { error: "Admin password required" });
      const id = route.split("/")[1];
      if (body.status !== undefined && !orderStatuses.has(body.status)) return response(400, { error: "Invalid status" });
      const patch = {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.is_paid !== undefined ? { is_paid: Boolean(body.is_paid) } : {}),
        ...(body.delivery_driver !== undefined ? { delivery_driver: body.delivery_driver || "" } : {}),
        ...(body.cashier_name !== undefined ? { cashier_name: body.cashier_name || "" } : {})
      };

      try {
        const order = await supabase("orders", {
          method: "PATCH",
          query: `id=eq.${encodeURIComponent(id)}`,
          body: patch
        });
        return response(200, decorateOrder(order[0]));
      } catch (error) {
        if (body.is_paid === undefined && body.delivery_driver === undefined && body.cashier_name === undefined) throw error;
        const current = (await supabase("orders", { query: `select=*&id=eq.${encodeURIComponent(id)}&limit=1` }))[0];
        const fallbackPatch = {
          ...(body.status !== undefined ? { status: body.status } : {}),
          notes: withOrderMeta(current?.notes || "", patch)
        };
        const order = await supabase("orders", {
          method: "PATCH",
          query: `id=eq.${encodeURIComponent(id)}`,
          body: fallbackPatch
        });
        return response(200, decorateOrder(order[0]));
      }
    }

    if (method === "GET" && route === "bot/demo") {
      return response(200, await handleSmartBotDemo({}));
    }

    if (method === "POST" && route === "bot/demo") {
      return response(200, await handleSmartBotDemo(body));
    }

    if ((method === "GET" || method === "POST") && route === "whatsapp/webhook") {
      return handleWhatsAppWebhook(event);
    }

    if (method === "POST" && route === "whatsapp/test") {
      if (!isAdmin(event)) return response(401, { error: "Admin password required" });
      return response(200, await handleSmartBotDemo({
        channel: "whatsapp",
        customer_phone: body.from || "5491100000000",
        message: body.message || "hola"
      }));
    }

    if (method === "POST" && route === "orders") {
      return response(200, await createOrderFromItems(body));
    }

    return response(404, { error: "Route not found", route });
  } catch (error) {
    return response(500, { error: error.message });
  }
};
