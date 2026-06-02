import { createOrder, getMenu, money } from "./store.js";

const messages = document.getElementById("messages");
const form = document.getElementById("botForm");
const input = document.getElementById("botInput");

let categories = [];
let products = [];
let step = "category";
let selectedCategory = null;
let cart = [];
let customer = {};

function say(text, who = "bot") {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function menuText() {
  return categories.map((cat, index) => `${index + 1}. ${cat.name} (${cat.items.length})`).join("\n");
}

function productText(category) {
  return category.items.map((product, index) => `${index + 1}. ${product.name} - ${money(product.price)}`).join("\n");
}

function cartSummary() {
  const lines = cart.map((item) => `- ${item.quantity} x ${item.product.name} (${money(item.product.price)} c/u)`);
  const total = cart.reduce((sum, item) => sum + item.quantity * item.product.price, 0);
  return `${lines.join("\n")}\n\nTotal estimado: ${money(total)}`;
}

function askCategory() {
  step = "category";
  say(`Hola, soy Tradi. Estas en modo demo/test.\n\nElegí una categoria:\n${menuText()}`);
}

function askProduct(categoryIndex) {
  selectedCategory = categories[categoryIndex];
  if (!selectedCategory) {
    askCategory();
    return;
  }
  step = "product";
  say(`Categoria: ${selectedCategory.name}\nElegí producto:\n${productText(selectedCategory)}\n\nEscribí "menu" para volver.`);
}

function askQuantity(productIndex) {
  const product = selectedCategory.items[productIndex];
  if (!product) {
    say("No encontre ese producto. Proba con otro numero.");
    return;
  }
  customer.pendingProduct = product;
  step = "quantity";
  say(`Cuantas unidades de "${product.name}" queres agregar?`);
}

function addQuantity(text) {
  const quantity = Math.max(1, Number.parseInt(text, 10) || 1);
  cart.push({ product: customer.pendingProduct, quantity });
  delete customer.pendingProduct;
  step = "more";
  say(`Agregado.\n\n${cartSummary()}\n\nQueres sumar algo mas? Responde "si" o "no".`);
}

function askDelivery() {
  step = "delivery";
  say("El pedido es para retiro o envio?");
}

function askPayment() {
  step = "payment";
  say("Forma de pago: efectivo, transferencia o Mercado Pago?");
}

function askConfirm() {
  step = "confirm";
  say(`Resumen final:\n${cartSummary()}\n\nCliente: ${customer.name}\nTelefono: ${customer.phone || "No informado"}\nEntrega: ${customer.delivery_type}\nDireccion: ${customer.address || "Retiro en local"}\nPago: ${customer.payment_method}\n\nConfirmas el pedido? Responde "si" o "no".`);
}

async function saveOrder() {
  say("Guardando pedido en modo demo/test...");
  const result = await createOrder({
    customer_name: customer.name,
    customer_phone: customer.phone || "",
    delivery_type: customer.delivery_type,
    address: customer.address || "",
    payment_method: customer.payment_method,
    notes: "Pedido tomado por bot demo/test",
    items: cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity }))
  });
  say(`Pedido guardado.\n\nResumen para enviar al local:\n${result.summary}`);
}

async function handle(text) {
  if (text.toLowerCase() === "menu") {
    askCategory();
    return;
  }

  if (step === "category") {
    askProduct(Number.parseInt(text, 10) - 1);
    return;
  }

  if (step === "product") {
    askQuantity(Number.parseInt(text, 10) - 1);
    return;
  }

  if (step === "quantity") {
    addQuantity(text);
    return;
  }

  if (step === "more") {
    if (text.toLowerCase().startsWith("s")) {
      askCategory();
    } else {
      step = "name";
      say("Perfecto. Decime el nombre del cliente.");
    }
    return;
  }

  if (step === "name") {
    customer.name = text;
    step = "phone";
    say("Telefono del cliente? Si no queres cargarlo, escribi no.");
    return;
  }

  if (step === "phone") {
    customer.phone = text.toLowerCase() === "no" ? "" : text;
    askDelivery();
    return;
  }

  if (step === "delivery") {
    customer.delivery_type = text.toLowerCase().includes("env") ? "envio" : "retiro";
    if (customer.delivery_type === "envio") {
      step = "address";
      say("Pasame la direccion completa para el envio.");
    } else {
      askPayment();
    }
    return;
  }

  if (step === "address") {
    customer.address = text;
    askPayment();
    return;
  }

  if (step === "payment") {
    customer.payment_method = text;
    askConfirm();
    return;
  }

  if (step === "confirm") {
    if (text.toLowerCase().startsWith("s")) {
      await saveOrder();
      step = "done";
      say("Listo. Para iniciar otro pedido, recarga la pagina.");
    } else {
      say("Pedido cancelado en demo.");
      step = "done";
    }
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  say(text, "user");
  input.value = "";
  await handle(text);
});

getMenu().then((data) => {
  categories = data.categories;
  products = categories.flatMap((cat) => cat.items);
  askCategory();
}).catch((error) => {
  say(`No pude cargar productos: ${error.message}`);
});
