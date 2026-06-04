import { getAdminData, money, saveProduct, saveSettings, updateOrder } from "./store.js";

const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const productForm = document.getElementById("productForm");
const productsTable = document.getElementById("productsTable");
const ordersTable = document.getElementById("ordersTable");
const dashboardStats = document.getElementById("dashboardStats");
const dashboardLists = document.getElementById("dashboardLists");
const driversForm = document.getElementById("driversForm");
const driversList = document.getElementById("driversList");
const businessName = document.getElementById("businessName");
const modeBadge = document.getElementById("modeBadge");
const imagePickerButton = document.getElementById("imagePickerButton");
const imageFileInput = document.getElementById("imageFileInput");
const imagePreview = document.getElementById("imagePreview");
const adminKey = "tradi_admin_password";
const fallbackImage = "../assets/tradi-burgerrr-3d-transparent.png";

let adminPassword = localStorage.getItem(adminKey) || "";
let products = [];
let orders = [];
let settings = {};
let driverOptions = [];

function currentImageUrl() {
  return productForm.elements.image_url.value.trim() || fallbackImage;
}

function updateImagePreview(src = "") {
  imagePreview.src = src || fallbackImage;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImage(file) {
  const image = await fileToImage(file);
  const maxSize = 1000;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.84);
}

function showDashboard() {
  loginPanel.classList.add("hidden");
  dashboard.classList.remove("hidden");
}

function fillProduct(product = {}) {
  productForm.elements.id.value = product.id || "";
  productForm.elements.name.value = product.name || "";
  productForm.elements.category.value = product.category || "";
  productForm.elements.price.value = product.price || "";
  productForm.elements.image_url.value = product.image_url || product.image || "";
  productForm.elements.description.value = product.description || product.desc || "";
  productForm.elements.is_active.checked = product.is_active !== false;
  imageFileInput.value = "";
  updateImagePreview(currentImageUrl());
  productForm.elements.name.focus();
}

function renderProducts() {
  productsTable.innerHTML = products.map((product) => `
    <tr>
      <td>
        <button class="thumb-button" type="button" data-edit-image="${product.id}" aria-label="Cambiar imagen de ${product.name}">
          <img class="thumb" src="${product.image_url || product.image || fallbackImage}" alt="">
        </button>
        <strong>${product.name}</strong>
      </td>
      <td>${product.category || ""}</td>
      <td>${money(product.price)}</td>
      <td><span class="status ${product.is_active === false ? "off" : ""}">${product.is_active === false ? "Inactivo" : "Activo"}</span></td>
      <td><button type="button" data-edit="${product.id}">Editar</button></td>
    </tr>
  `).join("");
}

function todayOrders() {
  const today = new Date().toLocaleDateString("es-AR");
  return orders.filter((order) => order.created_at && new Date(order.created_at).toLocaleDateString("es-AR") === today);
}

function renderDashboardPanel() {
  const todays = todayOrders();
  const activeOrders = orders.filter((order) => !["entregado", "cancelado"].includes(order.status));
  const pendingDelivery = orders.filter((order) => order.delivery_type === "envio" && !order.delivery_driver && !["entregado", "cancelado"].includes(order.status));
  const unpaid = orders.filter((order) => !order.is_paid && order.status !== "cancelado");
  const revenueToday = todays.filter((order) => order.status !== "cancelado").reduce((sum, order) => sum + Number(order.total || 0), 0);
  dashboardStats.innerHTML = [
    ["Pedidos hoy", todays.length],
    ["Facturacion hoy", money(revenueToday)],
    ["Activos", activeOrders.length],
    ["Sin repartidor", pendingDelivery.length],
    ["Sin cobrar", unpaid.length],
    ["Productos activos", products.filter((product) => product.is_active !== false).length]
  ].map(([label, value]) => `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");

  dashboardLists.innerHTML = `
    <article class="ops-card">
      <h2>Pedidos activos</h2>
      ${activeOrders.length ? activeOrders.slice(0, 6).map((order) => `
        <div class="ops-line">
          <span>${order.customer_name} · ${order.delivery_type === "envio" ? "Envio" : "Retiro"}</span>
          <strong>${money(order.total || 0)}</strong>
        </div>
      `).join("") : "<p>No hay pedidos activos.</p>"}
    </article>
    <article class="ops-card">
      <h2>Repartidores</h2>
      ${driverOptions.length ? driverOptions.map((driver) => `<span class="driver-chip">${driver}</span>`).join("") : "<p>Todavia no cargaste repartidores.</p>"}
    </article>
  `;
}

function renderDrivers() {
  driversList.innerHTML = driverOptions.length ? driverOptions.map((driver) => `
    <li>
      <span>${driver}</span>
      <button class="secondary" type="button" data-remove-driver="${driver}">Sacar</button>
    </li>
  `).join("") : `<li><span>No hay repartidores cargados.</span></li>`;
}

function renderOrders() {
  ordersTable.innerHTML = orders.length ? orders.map((order) => `
    <tr class="order-row order-row--${order.status || "pendiente"}">
      <td>
        <strong>${order.delivery_type === "envio" ? "Envio" : "Retiro"}</strong>
        ${order.address ? `<br><span>${order.address}</span><br><a class="mini-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}" target="_blank" rel="noreferrer">Ver mapa</a>` : "<br><span>Retira en local</span>"}
        ${order.notes ? `<br><small>${order.notes}</small>` : ""}
      </td>
      <td>${order.customer_name}<br><small>${order.customer_phone || ""}</small></td>
      <td>${money(order.total || 0)}</td>
      <td>
        <select data-order-field="is_paid" data-order-id="${order.id}">
          <option value="false" ${order.is_paid ? "" : "selected"}>No pago</option>
          <option value="true" ${order.is_paid ? "selected" : ""}>Pago</option>
        </select>
        <small>${order.payment_method || ""}</small>
      </td>
      <td>
        <select data-order-field="status" data-order-id="${order.id}">
          ${["pendiente", "confirmado", "preparado", "entregado", "cancelado"].map((status) => `
            <option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>
          `).join("")}
        </select>
      </td>
      <td>
        <select data-order-field="delivery_driver" data-order-id="${order.id}" ${order.delivery_type === "envio" ? "" : "disabled"}>
          ${["", ...driverOptions].map((driver) => `
            <option value="${driver}" ${(order.delivery_driver || "") === driver ? "selected" : ""}>${driver || (order.delivery_type === "envio" ? "Sin asignar" : "Retiro")}</option>
          `).join("")}
        </select>
      </td>
      <td>${order.created_at ? new Date(order.created_at).toLocaleString("es-AR") : ""}</td>
    </tr>
  `).join("") : `<tr><td colspan="7">Todavia no hay pedidos.</td></tr>`;
}

async function load() {
  const data = await getAdminData(adminPassword);
  products = data.products;
  orders = data.orders;
  settings = data.settings || {};
  driverOptions = Array.isArray(settings.delivery_drivers) ? settings.delivery_drivers : [];
  businessName.textContent = settings.business_name || "Tradi Burgerrr";
  modeBadge.textContent = data.mode === "supabase" ? "Conectado a Supabase" : "Modo demo local";
  renderDashboardPanel();
  renderProducts();
  renderDrivers();
  renderOrders();
  showDashboard();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminPassword = loginForm.elements.password.value;
  localStorage.setItem(adminKey, adminPassword);
  await load();
});

document.getElementById("logoutButton").addEventListener("click", () => {
  localStorage.removeItem(adminKey);
  location.reload();
});

document.getElementById("clearProduct").addEventListener("click", () => fillProduct());

imagePickerButton.addEventListener("click", () => {
  imageFileInput.click();
});

productForm.elements.image_url.addEventListener("input", () => {
  updateImagePreview(currentImageUrl());
});

imageFileInput.addEventListener("change", async () => {
  const file = imageFileInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("Elegí un archivo de imagen.");
    imageFileInput.value = "";
    return;
  }
  imagePickerButton.disabled = true;
  try {
    const dataUrl = await compressImage(file);
    productForm.elements.image_url.value = dataUrl;
    updateImagePreview(dataUrl);
  } catch (error) {
    alert("No pude cargar esa imagen. Probá con otra foto.");
  } finally {
    imagePickerButton.disabled = false;
  }
});

productsTable.addEventListener("click", (event) => {
  const imageButton = event.target.closest("[data-edit-image]");
  if (imageButton) {
    const product = products.find((item) => item.id === imageButton.dataset.editImage);
    fillProduct(product);
    scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => imageFileInput.click(), 250);
    return;
  }
  const button = event.target.closest("[data-edit]");
  if (!button) return;
  const product = products.find((item) => item.id === button.dataset.edit);
  fillProduct(product);
  scrollTo({ top: 0, behavior: "smooth" });
});

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(productForm);
  await saveProduct({
    id: data.get("id") || undefined,
    name: String(data.get("name")).trim(),
    category: String(data.get("category")).trim(),
    price: Number(data.get("price")),
    image_url: String(data.get("image_url")).trim(),
    description: String(data.get("description")).trim(),
    is_active: Boolean(data.get("is_active"))
  }, adminPassword);
  fillProduct();
  await load();
});

ordersTable.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-order-field]");
  if (!select) return;
  const value = select.dataset.orderField === "is_paid" ? select.value === "true" : select.value;
  await updateOrder(select.dataset.orderId, { [select.dataset.orderField]: value }, adminPassword);
  await load();
});

driversForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = driversForm.elements.driver_name;
  const name = String(input.value || "").trim();
  if (!name) return;
  const normalized = name.toLowerCase();
  if (!driverOptions.some((driver) => driver.toLowerCase() === normalized)) {
    await saveSettings({ delivery_drivers: [...driverOptions, name] }, adminPassword);
  }
  input.value = "";
  await load();
});

driversList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-driver]");
  if (!button) return;
  const nextDrivers = driverOptions.filter((driver) => driver !== button.dataset.removeDriver);
  await saveSettings({ delivery_drivers: nextDrivers }, adminPassword);
  await load();
});

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.add("hidden"));
    button.classList.add("active");
    document.getElementById(button.dataset.tab).classList.remove("hidden");
  });
});

if (adminPassword) {
  load().catch(() => localStorage.removeItem(adminKey));
}
