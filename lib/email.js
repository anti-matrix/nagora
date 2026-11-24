/**
 * lib/email.js — transactional email over plain fetch (no SDK), through one of:
 *   brevo   BREVO_API_KEY   (POST https://api.brevo.com/v3/smtp/email)
 *   resend  RESEND_API_KEY  (POST https://api.resend.com/emails)
 * chosen in that order by emailProvider(). Both send from EMAIL_FROM
 * ("NAGORA <no-reply@nagora.dpdns.org>"). EMAIL_CODE_SECRET is read by
 * lib/codes.js; it is checked here because it decides availability too.
 *
 * Nothing in this file logs an API key, a recipient, a code or a provider's
 * message text, with one exception: on a developer machine with no provider
 * key the whole email is printed to the console instead of being sent.
 */
import { isValidEmail, normalizeEmail } from "./validate.js";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10000;

export const EMAIL_UNAVAILABLE = "O envio de e-mails não está disponível no momento.";
export const EMAIL_SEND_FAILED = "Não foi possível enviar o e-mail. Tente novamente em instantes.";

/** Any Vercel deployment (production or preview) counts as production. */
export function isProduction(env = process.env) {
  return !!env.VERCEL || env.NODE_ENV === "production";
}

/** "brevo" when BREVO_API_KEY is set, else "resend" when RESEND_API_KEY is set, else null. */
export function emailProvider(env = process.env) {
  if (env.BREVO_API_KEY) return "brevo";
  if (env.RESEND_API_KEY) return "resend";
  return null;
}

/**
 * EMAIL_FROM as { name, email }: `Name <addr>`, `"Name" <addr>` or a bare
 * address (name ""). null when the address is not valid.
 */
export function parseSender(from) {
  const raw = typeof from === "string" ? from.trim() : "";
  if (!raw) return null;
  const m = raw.match(/^(.*?)\s*<([^<>\s]+)>$/);
  const name = m ? m[1].trim().replace(/^"(.*)"$/, "$1").trim() : "";
  const email = normalizeEmail(m ? m[2] : raw);
  return isValidEmail(email) ? { name, email } : null;
}

/**
 * True when the email features can work: always needs EMAIL_CODE_SECRET; with
 * a provider key also a valid EMAIL_FROM. With no provider key it is true only
 * outside production, where sendEmail() prints to the console.
 */
export function emailConfigured(env = process.env) {
  if (!env.EMAIL_CODE_SECRET) return false;
  if (emailProvider(env)) return !!parseSender(env.EMAIL_FROM);
  return !isProduction(env);
}

/**
 * The Brevo request body. These emails carry no links, so click tracking has
 * nothing to rewrite. Brevo has no per-message switch for the open pixel on
 * non-Enterprise plans: removeTrackingPixel is honoured only on Enterprise and
 * contactPixelTrackingConsent:false only anonymises when per-contact consent
 * is enabled on the account; both are sent anyway (ignored otherwise).
 */
export function brevoRequestBody({ sender, to, subject, text, html }) {
  return {
    sender: sender.name ? { name: sender.name, email: sender.email } : { email: sender.email },
    to: [{ email: to, removeTrackingPixel: true, contactPixelTrackingConsent: false }],
    subject,
    htmlContent: html,
    textContent: text,
  };
}

/** Short token for logs: only [A-Za-z0-9_.-], at most 60 characters. */
function logToken(value) {
  return typeof value === "string" ? value.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60) : "";
}

async function postJson(url, headers, body) {
  return fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
}

/** Reads one field of an error body for the log; never the message text (it can quote the recipient). */
async function errorKind(r, field) {
  try {
    const kind = logToken((await r.json())?.[field]);
    return kind ? ` (${kind})` : "";
  } catch {
    return "";
  }
}

async function sendBrevo(sender, message) {
  const r = await postJson(BREVO_URL, { "api-key": process.env.BREVO_API_KEY }, brevoRequestBody({ sender, ...message }));
  if (!r.ok) throw new Error(`Brevo responded ${r.status}${await errorKind(r, "code")}`);
  let messageId = null;
  try { messageId = (await r.json())?.messageId ?? null; } catch { /* 202 may have no JSON */ }
  return { dev: false, provider: "brevo", messageId };
}

async function sendResend(from, { to, subject, text, html }) {
  const r = await postJson(RESEND_URL, { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, { from, to: [to], subject, text, html });
  if (!r.ok) throw new Error(`Resend responded ${r.status}${await errorKind(r, "name")}`);
  let messageId = null;
  try { messageId = (await r.json())?.id ?? null; } catch { /* no JSON body */ }
  return { dev: false, provider: "resend", messageId };
}

export async function sendEmail({ to, subject, text, html }) {
  const provider = emailProvider();

  if (!provider) {
    if (isProduction()) throw new Error("Email is not configured");
    console.log(`[email:dev] not sent (no provider key)\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return { dev: true };
  }

  const sender = parseSender(process.env.EMAIL_FROM);
  if (!sender) throw new Error("Email is not configured");

  const message = { to, subject, text, html };
  return provider === "brevo" ? sendBrevo(sender, message) : sendResend(process.env.EMAIL_FROM.trim(), message);
}

// ── Templates (pt-BR, plain text + minimal HTML, no images, no tracking) ──

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** `paragraphs` are plain strings; `code` (optional) is shown large between them. */
function layout({ title, paragraphs, code }) {
  const text = [title, "", ...paragraphs.slice(0, 1), ...(code ? ["", code, ""] : []), ...paragraphs.slice(1), "", "NAGORA"]
    .join("\n");

  const p = (s) => `<p style="margin:0 0 14px;color:#cccccc;font-size:15px;line-height:1.5;">${escapeHtml(s)}</p>`;
  const codeBlock = code
    ? `<p style="margin:6px 0 20px;padding:14px 0;border:1px solid #444444;background:#0d0d0d;color:#ffffff;font-family:Consolas,Menlo,monospace;font-size:30px;letter-spacing:8px;text-align:center;">${escapeHtml(code)}</p>`
    : "";
  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px 12px;background:#000000;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:420px;margin:0 auto;background:#161616;border:1px solid #333333;padding:28px 24px;">
<div style="margin:0 0 20px;color:#ffffff;font-size:22px;font-weight:900;letter-spacing:4px;text-align:center;">NAGORA</div>
<h1 style="margin:0 0 16px;color:#ffffff;font-size:18px;font-weight:600;">${escapeHtml(title)}</h1>
${paragraphs.slice(0, 1).map(p).join("\n")}
${codeBlock}
${paragraphs.slice(1).map(p).join("\n")}
</div>
</body>
</html>`;

  return { text, html };
}

export function verifyEmailMessage({ username, code }) {
  return {
    subject: "Seu código de verificação — NAGORA",
    ...layout({
      title: "Confirme seu e-mail",
      paragraphs: [
        `Use o código abaixo para confirmar este e-mail na conta @${username}.`,
        "O código vale por 10 minutos e só pode ser usado uma vez.",
        "Se não foi você, ignore esta mensagem: nada muda na sua conta.",
      ],
      code,
    }),
  };
}

export function emailTakenMessage() {
  return {
    subject: "Tentativa de uso do seu e-mail — NAGORA",
    ...layout({
      title: "Este e-mail já está em uso",
      paragraphs: [
        "Alguém tentou adicionar este e-mail a uma conta do NAGORA, mas ele já está verificado em outra conta.",
        "Nenhum código foi enviado e nada mudou. Se foi você, entre na conta que já usa este e-mail ou recupere a senha dela na tela de login.",
        "Se não foi você, pode ignorar esta mensagem.",
      ],
    }),
  };
}

/** Date and time in pt-BR, Brasília time (the server runs in UTC). */
export function formatWhen(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${day} às ${time} (horário de Brasília)`;
}

/** Sent to the OLD address once a new one has been confirmed. No link, no new address. */
export function emailChangedMessage({ username, changedAt }) {
  return {
    subject: "O e-mail da sua conta foi alterado — NAGORA",
    ...layout({
      title: "O e-mail da conta foi alterado",
      paragraphs: [
        `O e-mail da conta @${username} foi alterado em ${formatWhen(changedAt)}. Este endereço não está mais ligado à conta e não recebe mais códigos de recuperação.`,
        "Se foi você, não precisa fazer nada.",
        "Se não foi você, alguém sabe a sua senha, porque a troca só é feita com ela. Entre na conta, cadastre seu e-mail de novo em Minha conta e depois use \"Esqueci minha senha\" na tela de login para criar uma senha nova.",
      ],
    }),
  };
}

export function recoverMessage({ username, code }) {
  return {
    subject: "Recuperação de senha — NAGORA",
    ...layout({
      title: "Recuperar senha",
      paragraphs: [
        `Use o código abaixo para criar uma nova senha para a conta @${username}.`,
        "O código vale por 10 minutos e só pode ser usado uma vez.",
        "Se não foi você, ignore esta mensagem: sua senha continua a mesma.",
      ],
      code,
    }),
  };
}

export function passwordChangedMessage({ username }) {
  return {
    subject: "Sua senha foi alterada — NAGORA",
    ...layout({
      title: "Sua senha foi alterada",
      paragraphs: [
        `A senha da conta @${username} foi alterada pela recuperação por e-mail. Todas as sessões abertas foram encerradas.`,
        "Se não foi você, recupere a senha novamente na tela de login e verifique quem tem acesso a este e-mail.",
      ],
    }),
  };
}
