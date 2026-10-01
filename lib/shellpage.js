/**
 * lib/shellpage.js — The browser terminal page for the nag shell.
 *
 * Served by the shell endpoint when the URL contains &browser=open:
 *   /api/shell?browser=open
 *
 * The page ALWAYS asks for the API key first (a ?key= in the URL is
 * ignored). Once the key is accepted, the session stays open until
 * "exit" is pressed, which returns to the authorization page.
 * The key is kept in memory and sent per-request via the
 * Authorization: Bearer header — never in the URL.
 */

export const SHELL_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>nag shell</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; }
  [hidden] { display: none !important; }
  body {
    font: 14px/1.5 Consolas, "Courier New", monospace;
    color: #fff;
    display: flex; flex-direction: column;
  }
  /* ── Authorization view ── */
  #auth {
    flex: 1; display: flex; align-items: center; justify-content: center;
  }
  #auth .box {
    width: min(420px, 90vw); padding: 28px 32px; border: 1px solid #444;
    border-radius: 0; background: #161616;
  }
  #auth h1 {
    margin: 0 0 22px; font-size: 18px; font-weight: normal; color: #fff;
    text-align: center;
  }
  #auth label {
    display: block; margin-bottom: 8px; color: #aaa;
  }
  #keyinput {
    width: 100%; box-sizing: border-box; padding: 10px 44px 10px 12px;
    font: 14px/1.5 Consolas, "Courier New", monospace;
    color: #fff; background: #0d0d0d;
    border: 1px solid #444; border-radius: 0; outline: none;
  }
  #keyinput:focus { border-color: #888; }
  .keyrow { position: relative; }
  #eyebtn {
    position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
    background: none; border: 0; cursor: pointer; padding: 4px;
    color: #888; display: flex; align-items: center;
  }
  #eyebtn:hover { color: #fff; }
  #authorize {
    width: 100%; margin-top: 14px; padding: 10px 0; cursor: pointer;
    font: 14px/1.5 Consolas, "Courier New", monospace;
    color: #fff; background: #222;
    border: 1px solid #444; border-radius: 0;
  }
  #authorize:disabled { opacity: .5; cursor: wait; }
  #auth-status {
    margin-top: 12px; min-height: 1.4em; text-align: center;
    color: #ff4444; white-space: pre-wrap;
  }
  /* ── Terminal view ── */
  #termwrap { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  #term { flex: 1; overflow-y: auto; padding: 12px 16px; white-space: pre-wrap;
          word-break: break-word; }
  #prompt {
    font: 14px/1.5 Consolas, "Courier New", monospace;
    color: #fff; background: transparent; border: 0; outline: none;
    caret-color: #fff; padding: 0; margin: 0;
    flex: 1; min-width: 0;
  }
  #inputrow { padding: 0 16px 12px; display: flex; align-items: baseline; }
  #inputrow span { white-space: nowrap; }
  .dim { color: #888; }
  .err { color: #ff4444; }
</style>
</head>
<body>
<div id="auth">
  <div class="box">
    <h1>nag shell: Authorization required</h1>
    <label for="keyinput">Insert correct API Key</label>
    <div class="keyrow">
      <input id="keyinput" type="password" autocomplete="off" spellcheck="false">
      <button id="eyebtn" type="button" title="Show key" aria-label="Show key"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
    </div>
    <button id="authorize">Authorize</button>
    <div id="auth-status"></div>
  </div>
</div>
<div id="termwrap" hidden>
  <pre id="term"></pre>
  <div id="inputrow">
    <span id="ps1">nag@nagora:/$&nbsp;</span><input id="prompt" autocomplete="off" spellcheck="false">
  </div>
</div>
<script>
(() => {
  const term = document.getElementById("term");
  const input = document.getElementById("prompt");
  const authEl = document.getElementById("auth");
  const termwrap = document.getElementById("termwrap");
  const keyInput = document.getElementById("keyinput");
  const authorizeBtn = document.getElementById("authorize");
  const authStatus = document.getElementById("auth-status");
  const eyebtn = document.getElementById("eyebtn");
  const EYE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  const api = location.pathname;
  const hist = [];
  let histIdx = -1;
  let closed = false;
  let cwd = "";
  let pending = null;   // { cmd, path } — multi-line content mode
  let contentLines = [];
  let authKey = "";     // in-memory only — never read from the URL
  const ps1 = document.getElementById("ps1");

  const updatePrompt = () => {
    ps1.textContent = pending
      ? "> "
      : "nag@nagora:/" + cwd + "$ ";
  };

  /** Resolve a path argument against the session cwd (cmd-style). */
  const toAbs = (p) => {
    const parts = (p.startsWith("/") ? p : (cwd ? cwd + "/" + p : p)).split("/");
    const out = [];
    for (const s of parts) {
      if (!s || s === ".") continue;
      if (s === "..") out.pop();
      else out.push(s);
    }
    return out.join("/");
  };

  /** Save a raw file via the File System Access API, else plain download. */
  const saveRaw = async (url, name) => {
    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({ suggestedName: name });
        const res = await fetch(url);
        const blob = await res.blob();
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      }
    } catch (e) {
      if (e.name === "AbortError") return; // user cancelled the picker
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const out = (text, cls) => {
    const node = document.createElement("div");
    if (cls) node.className = cls;
    if (text.includes("raw: ")) {
      for (const part of text.split("\\n")) {
        const m = part.match(/^raw: (.+)$/);
        if (m) {
          const a = document.createElement("a");
          a.href = m[1];
          a.textContent = "download " + m[1].split("/").pop();
          a.style.color = "#4fc3f7";
          a.addEventListener("click", (ev) => {
            ev.preventDefault();
            saveRaw(a.href, a.textContent.replace(/^download /, ""));
          });
          node.appendChild(a);
        } else {
          node.appendChild(document.createTextNode(part + "\\n"));
        }
      }
    } else {
      node.textContent = text;
    }
    term.appendChild(node);
    term.scrollTop = term.scrollHeight;
  };

  const banner = () => {
    out("");
    out("======================================================================");
    out("nag shell — nagora");
    out("======================================================================");
    out("session open. type 'exit' to return to the authorization page.");
  };

  /** Call the API with the session key via the Authorization header. */
  const callApi = async (params, body) => {
    const opts = { headers: {} };
    if (authKey) opts.headers["Authorization"] = "Bearer " + authKey;
    if (body !== undefined) {
      opts.method = "POST";
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(api + "?" + params.toString(), opts);
  };

  const showAuth = () => {
    authKey = "";
    closed = false;
    termwrap.hidden = true;
    authEl.hidden = false;
    keyInput.value = "";
    authStatus.textContent = "";
    keyInput.focus();
  };

  /** Validate the typed key (whoami) — opens the session when accepted. */
  const authorize = async () => {
    const key = keyInput.value.trim();
    if (!key) { authStatus.textContent = "Enter the key first."; return; }
    authStatus.textContent = "Checking…";
    authorizeBtn.disabled = true;
    try {
      authKey = key;
      const r = await callApi(new URLSearchParams({ cmd: "whoami" }));
      const text = await r.text();
      let granted = false;
      try { granted = JSON.parse(text).granted === true; } catch (e) { /* text output */ }
      if (!granted) granted = /granted\\s*:\\s*true/.test(text);

      if (r.ok && granted) {
        authEl.hidden = true;
        termwrap.hidden = false;
        authKey = key;
        banner();
        updatePrompt();
        input.focus();
      } else if (!r.ok) {
        authKey = "";
        let msg = "Invalid API key.";
        try { const j = JSON.parse(text); if (j && j.error) msg = j.error; } catch (e) { /* ignore */ }
        authStatus.textContent = msg;
      } else {
        authKey = "";
        authStatus.textContent = "Unexpected response from server.";
      }
    } catch (e) {
      authKey = "";
      authStatus.textContent = "Request failed: " + e.message;
    } finally {
      authorizeBtn.disabled = false;
    }
  };

  const exec = async (line) => {
    if (!line) return;
    out("$ " + line, "dim");

    if (line === "clear" || line === "cls") { term.textContent = ""; banner(); return; }
    if (line === "exit" || line === "quit") {
      out("session closed — returning to the authorization page.", "dim");
      showAuth();
      return;
    }

    // cd: local navigation (validated against the repo)
    if (line === "cd" || line.startsWith("cd ")) {
      const target = line.slice(3).trim();
      if (!target) { out(cwd ? "/" + cwd : "/"); return; }
      const resolved = toAbs(target);
      try {
        const r = await callApi(new URLSearchParams({ cmd: "dir " + resolved }));
        const text = await r.text();
        if (!r.ok || text.includes("not found")) {
          out("cd: " + target + ": no such directory", "err");
          return;
        }
        cwd = resolved;
        updatePrompt();
        out("→ /" + cwd);
      } catch (e) {
        out("cd failed: " + e.message, "err");
      }
      return;
    }

    // Rewrite relative paths for path-taking commands against cwd
    let apiCmd = line;
    const m = line.match(/^(\\S+)(?:\\s+(.*))?$/);
    if (m && ["dir", "ls", "cat", "edit", "add"].includes(m[1])) {
      const [first, ...others] = m[2] ? m[2].split(/\\s+/) : [];
      let pathArg = first ? toAbs(first) : (m[1] === "dir" || m[1] === "ls" ? cwd : "");
      apiCmd = m[1] + (pathArg ? " " + pathArg : "") + (others.length ? " " + others.join(" ") : "");
    }

    try {
      const r = await callApi(new URLSearchParams({ cmd: apiCmd }));
      const text = await r.text();
      if (!r.ok) {
        try { out(JSON.stringify(JSON.parse(text), null, 2), "err"); }
        catch (e) { out(text, "err"); }
        return;
      }
      out(text);
    } catch (e) {
      out("request failed: " + e.message, "err");
    }
  };

  const commit = () => {
    if (closed) return;
    const raw = input.value;
    input.value = "";
    histIdx = -1;

    if (pending) {
      if (raw.trim() === ".") {
        const apiCmd = pending.cmd + " " + pending.path + " " + contentLines.join("\\\\n");
        pending = null;
        contentLines = [];
        updatePrompt();
        exec(apiCmd);
      } else {
        contentLines.push(raw);
        out("  " + raw, "dim");
      }
      return;
    }

    const line = raw.trim();
    if (line && hist[hist.length - 1] !== line) hist.push(line);

    // add/edit <path> with no content → multi-line content mode
    const mm = line.match(/^(add|edit)\\s+(\\S+)$/);
    if (mm) {
      pending = { cmd: mm[1], path: mm[2] };
      contentLines = [];
      out("(content mode — paste lines, end with a line containing only '.')", "dim");
      updatePrompt();
      return;
    }

    exec(line);
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!hist.length) return;
      histIdx = histIdx < 0 ? hist.length - 1 : Math.max(0, histIdx - 1);
      input.value = hist[histIdx];
    }
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < 0) return;
      histIdx++;
      input.value = histIdx < hist.length ? hist[histIdx] : "";
      if (histIdx >= hist.length) histIdx = -1;
    }
    else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); term.textContent = ""; banner(); }
  });

  keyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); authorize(); }
  });
  authorizeBtn.addEventListener("click", authorize);
  eyebtn.addEventListener("click", () => {
    const show = keyInput.type === "password";
    keyInput.type = show ? "text" : "password";
    eyebtn.title = show ? "Hide key" : "Show key";
    eyebtn.innerHTML = show ? EYE_OFF_SVG : EYE_SVG;
    keyInput.focus();
  });

  document.addEventListener("click", (e) => {
    if (!termwrap.hidden && e.target !== input) input.focus();
  });
  keyInput.focus();
})();
</script>
</body>
</html>
`;
