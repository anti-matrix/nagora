const USERNAME_RE = /^[^\s]{5,15}$/;
const HAS_LETTER  = /[A-Za-z]/;
const HAS_NUMBER  = /[0-9]/;

function getCookie(name) {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return match ? match[1] : null;
}

const tabLogin  = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const form      = document.getElementById("auth-form");
const username  = document.getElementById("username");
const password  = document.getElementById("password");
const confirmGroup = document.getElementById("confirm-group");
const confirmPassword = document.getElementById("confirm-password");
const submitBtn = document.getElementById("submit-btn");
const message   = document.getElementById("message");
const apiKeySection = document.getElementById("apikey-section");
const getKeyBtn = document.getElementById("get-key-btn");
const apiKeyReveal = document.getElementById("apikey-reveal");
const apiKeyInput = document.getElementById("apikey");
const copyKeyBtn = document.getElementById("copy-key-btn");

let mode = "login";
let savedApiKey = "";

function setMode(next) {
  mode = next;
  if (mode === "login") {
    tabLogin.classList.add("active");
    tabSignup.classList.remove("active");
    confirmGroup.classList.add("hidden-field");
    submitBtn.textContent = "Entrar";
  } else {
    tabSignup.classList.add("active");
    tabLogin.classList.remove("active");
    confirmGroup.classList.remove("hidden-field");
    submitBtn.textContent = "Criar conta";
  }
  message.textContent = "";
  message.className = "mb-3 small";
}

tabLogin.addEventListener("click", () => setMode("login"));
tabSignup.addEventListener("click", () => setMode("signup"));

function validate() {
  const u = String(username.value).trim();
  const p = String(password.value);
  const c = String(confirmPassword.value);

  if (!USERNAME_RE.test(u)) {
    return "Usuário deve ter 5 a 15 caracteres (sem espaços).";
  }
  if (p.length < 8) {
    return "A senha deve ter pelo menos 8 caracteres.";
  }
  if (!HAS_LETTER.test(p) || !HAS_NUMBER.test(p)) {
    return "A senha deve conter letras e números.";
  }
  if (mode === "signup" && p !== c) {
    return "As senhas não coincidem.";
  }
  return null;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  message.className = "mb-3 small";

  const err = validate();
  if (err) {
    message.textContent = err;
    message.classList.add("text-danger");
    return;
  }

  const body = {
    action: mode,
    username: username.value.trim(),
    password: password.value,
  };

  if (mode === "signup") {
    body.confirmPassword = confirmPassword.value;
    body.userId = getCookie("userId");
  }

  try {
    const r = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await r.json();

    if (!r.ok) {
      message.textContent = data.error || "Erro desconhecido.";
      message.classList.add("text-danger");
      return;
    }

    if (mode === "signup") {
      setMode("login");
      username.value = data.username || username.value.trim();
      password.value = "";
      confirmPassword.value = "";
      message.textContent = "Conta criada! Faça login.";
      message.classList.remove("text-danger");
      message.classList.add("text-success");
      return;
    }

    // login success
    savedApiKey = data.apiKey;
    localStorage.setItem("nagora_api_key", savedApiKey);
    if (data.userId) {
      const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `userId=${data.userId}; expires=${expires}; path=/; SameSite=Lax`;
    }
    message.textContent = `Bem-vindo, ${data.username}!`;
    message.classList.remove("text-danger");
    message.classList.add("text-success");
    apiKeySection.classList.remove("hidden-field");
  } catch (e) {
    message.textContent = "Falha na conexão com o servidor.";
    message.classList.add("text-danger");
  }
});

getKeyBtn.addEventListener("click", () => {
  apiKeyInput.value = savedApiKey;
  apiKeyReveal.classList.remove("hidden-field");
});

copyKeyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(apiKeyInput.value);
    copyKeyBtn.textContent = "Copiado!";
    setTimeout(() => (copyKeyBtn.textContent = "Copiar"), 1500);
  } catch {
    apiKeyInput.select();
    document.execCommand("copy");
  }
});
