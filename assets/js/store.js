const sampleUrl = "/data/menu-sample.json";
const demoKey = "tradi_demo_store_v1";

function money(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

async function api(path, options = {}) {
  const res = await fetch(`/api/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.adminPassword ? { "x-admin-password": options.adminPassword } : {}),
      ...(options.headers || {})
    }
  });
  if (!res.ok) throw new Error((await res.json()).error || `API ${res.status}`);
  return res.json();
}

async function getDemoStore() {
  const cached = localStorage.getItem(demoKey);
  if (cached) return JSON.parse(cached);

  const sample = await fetch(sampleUrl).then((res) => res.json());
  const sampleCategories = Array.isArray(sample.categories) ? sample.categories : sample.categories.value;
  let index = 0;
  const categories = sampleCategories.map((category) => ({
    name: category.name,
    items: category.items.map((item) => ({
      id: `demo-${index++}`,
      name: item.name,
      description: item.desc || item.description || "",
      category: category.name,
      price: Number(item.price || 0),
      image_url: item.image || item.image_url || "",
      is_active: true
    }))
  }));

  const store = { settings: sample.settings, categories, orders: [] };
  localStorage.setItem(demoKey, JSON.stringify(store));
  return store;
}

function saveDemoStore(store) {
  localStorage.setItem(demoKey, JSON.stringify(store));
}

function productsFromCategories(categories, activeOnly = false) {
  return categories.flatMap((category) => category.items)
    .filter((product) => !activeOnly || product.is_active !== false);
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

export async function getMenu() {
  try {
    const data = await api("menu");
    return { ...data, mode: "supabase" };
  } catch {
    const store = await getDemoStore();
    return {
      settings: store.settings,
      categories: groupProducts(productsFromCategories(store.categories, true)),
      mode: "demo"
    };
  }
}

export async function getAdminData(adminPassword) {
  try {
    const [products, orders, settings] = await Promise.all([
      api("products", { adminPassword }),
      api("orders", { adminPassword }),
      api("settings")
    ]);
    return { products, orders, settings, mode: "supabase" };
  } catch {
    const store = await getDemoStore();
    return {
      products: productsFromCategories(store.categories, false),
      orders: store.orders || [],
      settings: store.settings,
      mode: "demo"
    };
  }
}

export async function saveSettings(settingsPatch, adminPassword) {
  try {
    return api("settings", {
      method: "PATCH",
      adminPassword,
      body: JSON.stringify(settingsPatch)
    });
  } catch {
    const store = await getDemoStore();
    store.settings = { ...store.settings, ...settingsPatch };
    saveDemoStore(store);
    return store.settings;
  }
}

export async function saveProduct(product, adminPassword) {
  try {
    if (product.id) {
      return api(`products/${product.id}`, {
        method: "PATCH",
        adminPassword,
        body: JSON.stringify(product)
      });
    }
    return api("products", { method: "POST", adminPassword, body: JSON.stringify(product) });
  } catch {
    const store = await getDemoStore();
    const products = productsFromCategories(store.categories, false);
    if (product.id) {
      const existing = products.find((item) => item.id === product.id);
      Object.assign(existing, product);
    } else {
      const category = product.category || "Menu";
      let group = store.categories.find((item) => item.name === category);
      if (!group) {
        group = { name: category, items: [] };
        store.categories.push(group);
      }
      group.items.push({ ...product, id: `demo-${Date.now()}`, is_active: product.is_active !== false });
    }
    saveDemoStore(store);
    return product;
  }
}

export async function updateOrder(orderId, patch, adminPassword) {
  try {
    return api(`orders/${orderId}`, {
      method: "PATCH",
      adminPassword,
      body: JSON.stringify(patch)
    });
  } catch {
    const store = await getDemoStore();
    const order = store.orders.find((item) => item.id === orderId);
    if (order) Object.assign(order, patch);
    saveDemoStore(store);
    return order;
  }
}

export async function updateOrderStatus(orderId, status, adminPassword) {
  return updateOrder(orderId, { status }, adminPassword);
}

export async function createOrder(order) {
  try {
    return api("orders", { method: "POST", body: JSON.stringify(order) });
  } catch {
    const store = await getDemoStore();
    const products = productsFromCategories(store.categories, true);
    const byId = new Map(products.map((item) => [item.id, item]));
    const items = order.items.map((item) => {
      const product = byId.get(item.product_id);
      const quantity = Math.max(1, Number(item.quantity || 1));
      return {
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: product.price,
        subtotal: product.price * quantity
      };
    });
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const saved = {
      id: `demo-order-${Date.now()}`,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone || "",
      delivery_type: order.delivery_type,
      address: order.address || "",
      payment_method: order.payment_method,
      is_paid: false,
      total,
      status: "pendiente",
      delivery_driver: "",
      cashier_name: "",
      notes: order.notes || "",
      created_at: new Date().toISOString(),
      items
    };
    store.orders.unshift(saved);
    saveDemoStore(store);

    const summary = [
      `Nuevo pedido ${store.settings.business_name}`,
      "",
      ...items.map((item) => `- ${item.quantity} x ${item.product_name} (${money(item.unit_price)} c/u)`),
      "",
      `Total: ${money(total)}`,
      `Cliente: ${saved.customer_name}`,
      `Telefono: ${saved.customer_phone || "No informado"}`,
      `Entrega: ${saved.delivery_type}`,
      `Direccion: ${saved.address || "Retiro en local"}`,
      `Pago: ${saved.payment_method}`,
      `Notas: ${saved.notes || "Sin notas"}`
    ].join("\n");

    return {
      order: saved,
      items,
      summary,
      whatsapp_url: `https://wa.me/${store.settings.whatsapp_number}?text=${encodeURIComponent(summary)}`
    };
  }
}

export { money, productsFromCategories, groupProducts };
