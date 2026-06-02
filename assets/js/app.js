import { getMenu, money } from "./store.js";

const panel = document.getElementById("chatPanel");
const chatToggle = document.querySelector("[data-toggle-chat]");
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

  renderMenuButtons();
}

function renderMenuButtons() {
  document.querySelectorAll("[data-menu-order]").forEach((slot) => {
    const index = Number(slot.dataset.menuOrder);
    const product = products[index];
    if (!product) return;
    slot.innerHTML = `
      <button class="add-menu" type="button">Pedir con Tradi</button>
    `;
    const addButton = slot.querySelector(".add-menu");
    addButton.addEventListener("click", () => {
      openChat();
      addButton.textContent = "Abrimos el bot";
      addButton.classList.add("added");
      setTimeout(() => {
        addButton.textContent = "Pedir con Tradi";
        addButton.classList.remove("added");
      }, 1200);
    });
  });
}

function openChat() {
  panel.classList.add("open");
  chatToggle?.setAttribute("aria-expanded", "true");
  if (heroVideo && typeof heroVideo.pause === "function") heroVideo.pause();
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

async function boot() {
  updateTopClock();
  setInterval(updateTopClock, 1000);
  document.querySelectorAll("[data-open-chat]").forEach((button) => button.addEventListener("click", openChat));
  chatToggle?.addEventListener("click", toggleChat);
  document.querySelector("[data-close-chat]").addEventListener("click", closeChat);

  const data = await getMenu();
  settings = data.settings;
  renderSettings();
  renderMenu(data.categories);
}

boot().catch((error) => {
  menuCascade.innerHTML = `<div class="bot-line">No pude cargar el menu: ${error.message}</div>`;
});
