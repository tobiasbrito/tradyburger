import { getAdminData, money, saveProduct, updateOrderStatus } from "./store.js";

const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const productForm = document.getElementById("productForm");
const productsTable = document.getElementById("productsTable");
const ordersTable = document.getElementById("ordersTable");
const businessName = document.getElementById("businessName");
const modeBadge = document.getElementById("modeBadge");
const adminKey = "tradi_admin_password";

let adminPassword = localStorage.getItem(adminKey) || "";
let products = [];
let orders = [];

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
  productForm.elements.name.focus();
}

function renderProducts() {
  productsTable.innerHTML = products.map((product) => `
    <tr>
      <td>
        <img class="thumb" src="${product.image_url || product.image || "../assets/tradi-burgerrr-3d-transparent.png"}" alt="">
        <strong>${product.name}</strong>
      </td>
      <td>${product.category || ""}</td>
      <td>${money(product.price)}</td>
      <td><span class="status ${product.is_active === false ? "off" : ""}">${product.is_active === false ? "Inactivo" : "Activo"}</span></td>
      <td><button type="button" data-edit="${product.id}">Editar</button></td>
    </tr>
  `).join("");
}

function renderOrders() {
  ordersTable.innerHTML = orders.length ? orders.map((order) => `
    <tr>
      <td><strong>${order.id}</strong><br>${order.delivery_type || ""} ${order.address ? `- ${order.address}` : ""}</td>
      <td>${order.customer_name}<br><small>${order.customer_phone || ""}</small></td>
      <td>${money(order.total || 0)}</td>
      <td>
        <select data-order-status="${order.id}">
          ${["pendiente", "confirmado", "preparado", "entregado", "cancelado"].map((status) => `
            <option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>
          `).join("")}
        </select>
      </td>
      <td>${order.created_at ? new Date(order.created_at).toLocaleString("es-AR") : ""}</td>
    </tr>
  `).join("") : `<tr><td colspan="5">Todavia no hay pedidos.</td></tr>`;
}

async function load() {
  const data = await getAdminData(adminPassword);
  products = data.products;
  orders = data.orders;
  businessName.textContent = data.settings?.business_name || "Tradi Burgerrr";
  modeBadge.textContent = data.mode === "supabase" ? "Conectado a Supabase" : "Modo demo local";
  renderProducts();
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

productsTable.addEventListener("click", (event) => {
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
  const select = event.target.closest("[data-order-status]");
  if (!select) return;
  await updateOrderStatus(select.dataset.orderStatus, select.value, adminPassword);
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
