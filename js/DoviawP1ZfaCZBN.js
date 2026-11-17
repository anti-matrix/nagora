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
                <button type="button" class="auth-link" id="forgot-link">Esqueci minha senha</button>
            </form>

            <form id="recover-form" class="hidden-field" novalidate>
                <div class="mb-3" id="recover-identifier-group">
                    <label for="recover-identifier" class="form-label">Usuário ou e-mail</label>
                    <input type="text" class="form-control" id="recover-identifier" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="254" required/>
                    <div class="form-text">Enviamos um código para o e-mail verificado da conta</div>
                </div>

                <div class="hidden-field" id="recover-step2">
                    <div class="mb-3">
                        <label for="recover-code" class="form-label">Código</label>
                        <input type="text" class="form-control" id="recover-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*"/>
                        <div class="form-text">6 dígitos, válido por 10 minutos</div>
                    </div>

                    <div class="mb-3">
                        <label for="recover-password" class="form-label">Nova senha</label>
                        <input type="password" class="form-control" id="recover-password" autocomplete="new-password"/>
                        <div class="form-text">Mínimo 8 caracteres, com letras e números</div>
                    </div>

                    <div class="mb-3">
                        <label for="recover-confirm" class="form-label">Confirmar nova senha</label>
                        <input type="password" class="form-control" id="recover-confirm" autocomplete="new-password"/>
                    </div>
                </div>

                <button type="submit" class="btn btn-light w-100" id="recover-submit">Enviar código</button>
                <button type="button" class="auth-link" id="recover-back">Voltar para o login</button>
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
const forgotLink = document.getElementById("forgot-link");
const recoverForm = document.getElementById("recover-form");
const recoverIdentifierGroup = document.getElementById("recover-identifier-group");
const recoverIdentifier = document.getElementById("recover-identifier");
const recoverStep2 = document.getElementById("recover-step2");
const recoverCode = document.getElementById("recover-code");
const recoverPassword = document.getElementById("recover-password");
const recoverConfirm = document.getElementById("recover-confirm");
const recoverSubmit = document.getElementById("recover-submit");
const recoverBack = document.getElementById("recover-back");

let mode = "login";
let recoverStep = 1;
let recoverBusy = false;

function setMode(next) {
  mode = next;
  form.classList.remove("hidden-field");
  recoverForm.classList.add("hidden-field");
  forgotLink.classList.toggle("hidden-field", mode !== "login");
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

// ── Password recovery: step 1 asks for the account, step 2 for the code and a new password ──
function showMessage(text, kind) {
  message.textContent = text;
  message.className = "mb-3 small" + (kind ? " " + kind : "");
}

function setRecoverStep(step) {
  recoverStep = step;
  recoverIdentifierGroup.classList.toggle("hidden-field", step !== 1);
  recoverStep2.classList.toggle("hidden-field", step !== 2);
  recoverSubmit.textContent = step === 1 ? "Enviar código" : "Alterar senha";
}

function openRecover() {
  mode = "recover";
  tabLogin.classList.add("active");
  tabSignup.classList.remove("active");
  form.classList.add("hidden-field");
  recoverForm.classList.remove("hidden-field");
  authHeading.textContent = "Recuperar senha";
  recoverIdentifier.value = username.value.trim();
  recoverCode.value = "";
  recoverPassword.value = "";
  recoverConfirm.value = "";
  setRecoverStep(1);
  showMessage("");
  recoverIdentifier.focus();
}

forgotLink.addEventListener("click", openRecover);
recoverBack.addEventListener("click", () => setMode("login"));

recoverCode.addEventListener("input", () => {
  const digits = recoverCode.value.replace(/\D/g, "").slice(0, 6);
  if (recoverCode.value !== digits) recoverCode.value = digits;
  if (digits.length === 6) recoverPassword.focus();
});

async function postRecover(body) {
  const r = await fetch("/api/recover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { r, data };
}

/** 429 and 503 carry a pt-BR sentence from the server. */
function recoverServerText(r, data, fallback) {
  return (r.status === 429 || r.status === 503) && data.error ? data.error : fallback;
}

async function submitRecoverStart() {
  const identifier = recoverIdentifier.value.trim();
  if (!identifier) {
    showMessage("Digite seu usuário ou e-mail.", "text-danger");
    return;
  }

  const { r, data } = await postRecover({ action: "start", identifier });
  if (!r.ok) {
    showMessage(recoverServerText(r, data, "Não foi possível enviar o código. Tente novamente."), "text-danger");
    return;
  }
  setRecoverStep(2);
  // The same sentence whether or not the account exists or has an email.
  showMessage("Se existir uma conta com e-mail verificado, enviamos um código.", "auth-note");
  recoverCode.focus();
}

async function submitRecoverConfirm() {
  const code = recoverCode.value.replace(/\D/g, "");
  const p = String(recoverPassword.value);

  if (code.length !== 6) {
    showMessage("Digite o código de 6 dígitos.", "text-danger");
    return;
  }
  if (p.length < 8) {
    showMessage("A senha deve ter pelo menos 8 caracteres.", "text-danger");
    return;
  }
  if (!HAS_LETTER.test(p) || !HAS_NUMBER.test(p)) {
    showMessage("A senha deve conter letras e números.", "text-danger");
    return;
  }
  if (p !== String(recoverConfirm.value)) {
    showMessage("As senhas não coincidem.", "text-danger");
    return;
  }

  const identifier = recoverIdentifier.value.trim();
  const { r, data } = await postRecover({ action: "confirm", identifier, code, newPassword: p });
  if (!r.ok) {
    recoverCode.value = "";
    showMessage(recoverServerText(r, data, "Código inválido ou expirado."), "text-danger");
    recoverCode.focus();
    return;
  }

  setMode("login");
  username.value = data.username || (identifier.includes("@") ? "" : identifier);
  password.value = "";
  showMessage("Senha alterada! Faça login com a nova senha.", "text-success");
  (username.value ? password : username).focus();
}

recoverForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (recoverBusy) return;
  recoverBusy = true;
  recoverSubmit.disabled = true;
  try {
    if (recoverStep === 1) await submitRecoverStart();
    else await submitRecoverConfirm();
  } catch {
    showMessage("Falha na conexão com o servidor.", "text-danger");
  } finally {
    recoverBusy = false;
    recoverSubmit.disabled = false;
  }
});

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
