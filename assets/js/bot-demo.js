const messages = document.getElementById("messages");
const form = document.getElementById("botForm");
const input = document.getElementById("botInput");
const quickReplies = document.getElementById("quickReplies");

let sessionId = "";
let sending = false;

function say(text, who = "bot") {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function setQuickReplies(items = []) {
  quickReplies.innerHTML = items.map((item) => `<button type="button" data-reply="${item}">${item}</button>`).join("");
}

function typing() {
  const div = say("Tradi esta pensando...", "bot typing");
  return () => div.remove();
}

async function botRequest(message = "") {
  const options = message
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message })
      }
    : {};
  const res = await fetch("/api/bot/demo", options);
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || `Bot ${res.status}`);
  sessionId = payload.session_id;
  return payload;
}

function repliesForStep(step) {
  if (step === "category") return ["quiero 2 chesse simple y una coca", "ver bebidas", "carrito", "ayuda"];
  if (step === "product") return ["1", "2", "menu", "carrito"];
  if (step === "quantity") return ["1", "2", "3"];
  if (step === "more") return ["no", "ver bebidas", "quiero una coca", "carrito"];
  if (step === "delivery") return ["retiro", "envio"];
  if (step === "payment") return ["efectivo", "transferencia", "Mercado Pago"];
  if (step === "confirm") return ["si", "no"];
  return ["nuevo", "menu"];
}

function showStartState() {
  setQuickReplies(["hola", "menu", "bebidas", "ayuda"]);
  input.focus();
}

async function sendToBot(text = "") {
  if (sending) return;
  sending = true;
  if (text) say(text, "user");
  input.value = "";
  input.disabled = true;
  const stopTyping = typing();
  try {
    const payload = await botRequest(text);
    stopTyping();
    say(payload.reply);
    setQuickReplies(repliesForStep(payload.step));
  } catch (error) {
    stopTyping();
    say(`Me trabe un segundo: ${error.message}\nProba de nuevo o escribi "nuevo".`);
  } finally {
    input.disabled = false;
    input.focus();
    sending = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  await sendToBot(text);
});

quickReplies.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-reply]");
  if (!button) return;
  await sendToBot(button.dataset.reply);
});

showStartState();
