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

function buildWhatsAppSummary(order, items, settings) {
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
    `Notas: ${order.notes || "Sin notas"}`,
    "",
    `Pedido guardado: ${order.id}`
  ];
  return lines.join("\n");
}

async function getSettings() {
  const rows = await supabase("settings", { query: "select=*&limit=1" });
  return rows[0] || {
    business_name: "Tradi Burgerrr",
    whatsapp_number: "5491162588633",
    address: "Fraga 2900 - B. San Eduardo - Merlo",
    opening_hours: "Lunes a Domingo 20hs a 23:45hs",
    delivery_enabled: true,
    delivery_cost: 0
  };
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

    if (method === "GET" && route === "settings") {
      return response(200, await getSettings());
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
      if (!isAdmin(event)) return response(401, { error: "Admin password required" });
      return response(200, await supabase("products", { query: "select=*&order=created_at.asc" }));
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
      return response(200, orders);
    }

    if (method === "PATCH" && route.startsWith("orders/")) {
      if (!isAdmin(event)) return response(401, { error: "Admin password required" });
      const id = route.split("/")[1];
      if (!orderStatuses.has(body.status)) return response(400, { error: "Invalid status" });
      const order = await supabase("orders", {
        method: "PATCH",
        query: `id=eq.${encodeURIComponent(id)}`,
        body: { status: body.status }
      });
      return response(200, order[0]);
    }

    if (method === "POST" && route === "orders") {
      const requestedItems = Array.isArray(body.items) ? body.items : [];
      if (!requestedItems.length) return response(400, { error: "Order needs at least one item" });

      const ids = requestedItems.map((item) => item.product_id).filter(Boolean);
      const products = await supabase("products", {
        query: `select=*&id=in.(${ids.map(encodeURIComponent).join(",")})&is_active=eq.true`
      });
      const byId = new Map(products.map((product) => [product.id, product]));
      const orderItems = requestedItems
        .map((item) => ({ product: byId.get(item.product_id), quantity: Math.max(1, Number(item.quantity || 1)) }))
        .filter((item) => item.product);

      if (!orderItems.length) return response(400, { error: "No valid active products in order" });

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

      return response(200, { order, items: savedItems, summary, whatsapp_url: whatsappUrl });
    }

    return response(404, { error: "Route not found", route });
  } catch (error) {
    return response(500, { error: error.message });
  }
};
