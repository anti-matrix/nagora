/**
 * lib/email.js — transactional email through the Resend HTTP API (no SDK).
 *
 * Env: RESEND_API_KEY, EMAIL_FROM, EMAIL_CODE_SECRET (the last one is read by
 * lib/codes.js; it is listed here because all three decide availability).
 *
 * Nothing in this file logs the API key, a recipient or a code, with one
 * exception: on a developer machine with no RESEND_API_KEY the whole email is
 * printed to the console instead of being sent.
 */

const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10000;

export const EMAIL_UNAVAILABLE = "O envio de e-mails não está disponível no momento.";
export const EMAIL_SEND_FAILED = "Não foi possível enviar o e-mail. Tente novamente em instantes.";

/** Any Vercel deployment (production or preview) counts as production. */
export function isProduction(env = process.env) {
  return !!env.VERCEL || env.NODE_ENV === "production";
}

/**
 * True when the email features can work: always needs EMAIL_CODE_SECRET; in
 * production also RESEND_API_KEY and EMAIL_FROM. Outside production a missing
 * RESEND_API_KEY only switches sendEmail() to the console.
 */
export function emailConfigured(env = process.env) {
  if (!env.EMAIL_CODE_SECRET) return false;
  if (env.RESEND_API_KEY && env.EMAIL_FROM) return true;
  return !env.RESEND_API_KEY && !isProduction(env);
}

export async function sendEmail({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    if (isProduction()) throw new Error("Email is not configured");
    console.log(`[email:dev] not sent (no RESEND_API_KEY)\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return { dev: true };
  }

  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("Email is not configured");

  const r = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!r.ok) {
    // Only the status and Resend's error type: its message can quote the recipient.
    let kind = "";
    try {
      const data = await r.json();
      if (typeof data?.name === "string") kind = ` (${data.name.slice(0, 60)})`;
    } catch { /* no JSON body */ }
    throw new Error(`Resend responded ${r.status}${kind}`);
  }
  return { dev: false };
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
