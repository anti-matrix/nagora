// Injects the auth layout before any DOM refs are resolved.
(function buildAuth() {
  const markup = `
    <h1 class="nagora-title">NAGORA</h1>

    <div class="auth-card">
        <div class="auth-nav">
            <button id="tab-login" class="active" type="button">Entrar</button>
            <button id="tab-signup" type="button">Criar conta</button>
        </div>

        <div class="auth-body">
            <h4 class="text-center mb-4" id="auth-heading">Faça login</h4>

            <div id="message" class="mb-3 small"></div>

            <form id="auth-form" novalidate>
                <div class="mb-3">
                    <label for="username" class="form-label">Usuário</label>
                    <input type="text" class="form-control" id="username" autocomplete="username" required/>
                    <div class="form-text">5 a 15 caracteres, sem espaços</div>
                </div>

                <div class="mb-3">
                    <label for="password" class="form-label">Senha</label>
                    <input type="password" class="form-control" id="password" autocomplete="current-password" required/>
                    <div class="form-text" id="password-help">Mínimo 8 caracteres, com letras e números</div>
                </div>

                <div class="mb-3 hidden-field" id="confirm-group">
                    <label for="confirm-password" class="form-label">Confirmar senha</label>
                    <input type="password" class="form-control" id="confirm-password" autocomplete="new-password"/>
                </div>

                <button type="submit" class="btn btn-light w-100" id="submit-btn">Entrar</button>
            </form>

        </div>
    </div>

`;
  document.body.insertAdjacentHTML("afterbegin", markup);
  if (!document.getElementById("auth-form")) throw new Error("buildAuth: layout injection failed");
})();

const USERNAME_RE = /^[^\s]{5,15}$/;
const HAS_LETTER  = /[A-Za-z]/;
const HAS_NUMBER  = /[0-9]/;

function getCookie(name) {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return match ? match[1] : null;
}

function setCookie(name, value, days) {
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; path=/; SameSite=Lax`;
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
const authHeading = document.getElementById("auth-heading");

let mode = "login";

function setMode(next) {
  mode = next;
  if (mode === "login") {
    tabLogin.classList.add("active");
    tabSignup.classList.remove("active");
    confirmGroup.classList.add("hidden-field");
    submitBtn.textContent = "Entrar";
    authHeading.textContent = "Faça login";
  } else {
    tabSignup.classList.add("active");
    tabLogin.classList.remove("active");
    confirmGroup.classList.remove("hidden-field");
    submitBtn.textContent = "Criar conta";
    authHeading.textContent = "Criar sua conta";
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
      credentials: "include",
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

    if (data.userId) {
      setCookie("userId", data.userId, 365);
    }
    location.href = "app.html";
  } catch (e) {
    message.textContent = "Falha na conexão com o servidor.";
    message.classList.add("text-danger");
  }
});

(async function checkSession() {
  try {
    const r = await fetch("/api/handshake", { credentials: "include" });
    if (r.ok) {
      const data = await r.json();
      if (data.ok) {
        location.href = "app.html";
      }
    }
  } catch {
    // ignore, stay on login page
  }
})();
