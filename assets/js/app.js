import { createOrder, getMenu, money } from "./store.js";

const panel = document.getElementById("chatPanel");
const chatToggle = document.querySelector("[data-toggle-chat]");
const qtyGrid = document.getElementById("qtyGrid");
const totalEl = document.getElementById("orderTotal");
const form = document.getElementById("orderForm");
const heroVideo = document.querySelector(".hero-video");
const menuCascade = document.getElementById("menuCascade");
const topDate = document.getElementById("topDate");
const topTime = document.getElementById("topTime");

let settings = null;
let products = [];

function updateTopClock() {
  const now = new Date();
  const compact = window.matchMedia("(max-width: 560px)").matches;
  if (topDate) {
    topDate.textContent = new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: compact ? "2-digit" : "long",
      year: "numeric",
      ...(compact ? {} : { weekday: "long" }),
      timeZone: "America/Argentina/Buenos_Aires"
    }).format(now);
  }
  if (topTime) {
    topTime.textContent = new Intl.DateTimeFormat("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires"
    }).format(now);
  }
}

function normalizeImage(product) {
  return product.image_url || product.image || "assets/tradi-burgerrr-3d-transparent.png";
}

function renderSettings() {
  if (!settings) return;
  document.querySelectorAll('a[href*="wa.me"]').forEach((link) => {
    link.href = `https://wa.me/${settings.whatsapp_number}`;
  });
}

function renderMenu(categories) {
  menuCascade.innerHTML = "";
  products = categories.flatMap((category) => category.items);

  categories.forEach((category, categoryIndex) => {
    const detail = document.createElement("details");
    detail.className = "menu-category";

    const summary = document.createElement("summary");
    summary.innerHTML = `<span>${category.name}</span><small>${category.items.length} productos</small>`;

    const list = document.createElement("div");
    list.className = "cascade-products";

    category.items.forEach((product) => {
      const index = products.findIndex((item) => item.id === product.id);
      const article = document.createElement("article");
      article.className = "cascade-product";
      article.innerHTML = `
        <img alt="${product.name}" src="${normalizeImage(product)}" loading="lazy">
        <div class="cascade-info">
          <div class="cascade-top">
            <h3>${product.name}</h3>
            <span class="price">${money(product.price)}</span>
          </div>
          <p>${product.description || product.desc || "Producto de la carta Tradiburger."}</p>
          <div class="menu-order" data-menu-order="${index}"></div>
        </div>
      `;
      list.appendChild(article);
    });

    detail.append(summary, list);
    menuCascade.appendChild(detail);
  });

  renderBotRows();
  renderMenuButtons();
  updateTotal();
}

function renderBotRows() {
  qtyGrid.innerHTML = "";
  products.forEach((product, index) => {
    const row = document.createElement("label");
    row.className = "qty-row";
    row.innerHTML = `
      <span>${product.name}<small>${money(product.price)}</small></span>
      <input type="number" min="0" max="20" value="0" name="qty-${index}" aria-label="Cantidad ${product.name}">
    `;
    qtyGrid.appendChild(row);
  });
}

function renderMenuButtons() {
  document.querySelectorAll("[data-menu-order]").forEach((slot) => {
    const index = Number(slot.dataset.menuOrder);
    const product = products[index];
    if (!product) return;
    slot.innerHTML = `
      <input class="menu-qty" type="number" min="1" max="20" value="1" aria-label="Cantidad ${product.name}">
      <button class="add-menu" type="button">Agregar</button>
    `;
    const qtyInput = slot.querySelector(".menu-qty");
    const addButton = slot.querySelector(".add-menu");
    addButton.addEventListener("click", () => {
      const qtyToAdd = Math.max(1, Math.min(20, Number(qtyInput.value || 1)));
      const botInput = form.elements[`qty-${index}`];
      botInput.value = Math.min(20, Number(botInput.value || 0) + qtyToAdd);
      updateTotal();
      openChat();
      addButton.textContent = "Agregado";
      addButton.classList.add("added");
      setTimeout(() => {
        addButton.textContent = "Agregar";
        addButton.classList.remove("added");
      }, 1200);
    });
  });
}

function openChat() {
  panel.classList.add("open");
  chatToggle?.setAttribute("aria-expanded", "true");
  if (heroVideo && typeof heroVideo.pause === "function") heroVideo.pause();
  if (form.elements.customer) form.elements.customer.focus();
}

function closeChat() {
  panel.classList.remove("open");
  chatToggle?.setAttribute("aria-expanded", "false");
  if (heroVideo && typeof heroVideo.play === "function") heroVideo.play().catch(() => {});
}

function toggleChat() {
  if (panel.classList.contains("open")) closeChat();
  else openChat();
}

function getQuantities() {
  return products.map((product, index) => {
    const input = form.elements[`qty-${index}`];
    return { ...product, qty: Number(input?.value || 0) };
  });
}

function updateTotal() {
  const total = getQuantities().reduce((sum, item) => sum + item.qty * item.price, 0);
  totalEl.textContent = money(total);
  return total;
}

async function submitOrder(event) {
  event.preventDefault();
  const chosen = getQuantities().filter((item) => item.qty > 0);
  if (!chosen.length) {
    alert("Elegi al menos un producto para mandar el pedido.");
    return;
  }

  const data = new FormData(form);
  const customer = String(data.get("customer") || "").trim();
  const phone = String(data.get("phone") || "").trim();
  const deliveryType = String(data.get("delivery_type") || "retiro");
  const address = String(data.get("address") || "").trim();
  const notes = String(data.get("notes") || "").trim();

  if (!customer) {
    form.elements.customer.focus();
    alert("Decime tu nombre para preparar el pedido.");
    return;
  }

  if (deliveryType === "envio" && address.length < 8) {
    form.elements.address.focus();
    alert("Completa mejor la direccion: calle, numero y una referencia.");
    return;
  }

  const sendButton = form.querySelector(".chat-send");
  sendButton.disabled = true;
  sendButton.textContent = "Guardando pedido...";

  try {
    const result = await createOrder({
      customer_name: customer,
      customer_phone: phone,
      delivery_type: deliveryType,
      address,
      payment_method: data.get("payment"),
      notes,
      items: chosen.map((item) => ({ product_id: item.id, quantity: item.qty }))
    });
    window.open(result.whatsapp_url, "_blank", "noopener");
    alert("Pedido guardado. Se abre WhatsApp con el resumen para el local.");
  } catch (error) {
    alert(`No pude guardar el pedido: ${error.message}`);
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "Enviar pedido por WhatsApp";
  }
}

async function boot() {
  updateTopClock();
  setInterval(updateTopClock, 1000);
  document.querySelectorAll("[data-open-chat]").forEach((button) => button.addEventListener("click", openChat));
  chatToggle?.addEventListener("click", toggleChat);
  document.querySelector("[data-close-chat]").addEventListener("click", closeChat);
  form.addEventListener("input", updateTotal);
  form.addEventListener("submit", submitOrder);

  const data = await getMenu();
  settings = data.settings;
  renderSettings();
  renderMenu(data.categories);
}

boot().catch((error) => {
  menuCascade.innerHTML = `<div class="bot-line">No pude cargar el menu: ${error.message}</div>`;
});
