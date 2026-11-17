/**
 * lib/shell.js — The nag API shell engine.
 *
 * Shared by /api/logs and /api/shell:
 *   ?key=KEY                → landing (banner+help, or logs per mode)
 *   ?key=KEY&cmd=<command>  → run one command
 *   POST {"commands":[...]} → run several commands
 * Legacy query params (flat, keys, userId, field, tree) still work.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { requireApiKey } from "./auth.js";
import { SHELL_PAGE } from "./shellpage.js";
import { userKey, USERIDS } from "./redis.js";
import { ROOMS, invalidRooms } from "./rooms.js";
import { findAccountByUsername, banAccount, unbanAccount, listBannedAccounts, describeBans } from "./moderation.js";

// API owner shown in the access-granted message.
export const OWNER = process.env.NAGORA_OWNER || "nagora";

// Directories skipped by the tree command.
export const SKIP_TREE = new Set(["node_modules", ".git"]);

// Fallback GitHub repo (override with the GITHUB_REPO env var).
const GITHUB_DEFAULT = "nagora/nagora";

const LEGACY_PARAMS = ["userId", "field", "flat", "keys", "tree"];

export const HELP = [
  "",
  "nag shell — commands (append &cmd=<command> to the URL, or POST {\"commands\":[...]}):",
  "  help / ?                     show this help",
  "  whoami                       show key acceptance + access header",
  "  users                        unique userIds with record counts",
  "  users=<userId>               show one user's record",
  "  users=<path>                 values at that path, each with its userIds",
  "  users=<path>.<val>           userIds having that value",
  "  users=<path>.<val> [<path>…] same, plus full extra values per user",
  "  usersid                      list all userIds (JSON)",
  "  usersid=<path>[.<val>]       each user's value at that path",
  "  userid=<id> | user <id>      show one user's record",
  "  flat                         all users, unwrapped",
  "  keys                         all key paths",
  "  tree                         all files in the root directory",
  "  field [<path>] [value <val>]  all fields, values or filtered records",
  "  field <path>.<val>           users with that value + their info",
  "  cat <path>                   show a repo file's content",
  "  dir [<path>]                 list a repo directory (ls also works)",
  "  add <path> <content>         create a new file (\\n for newlines)",
  "  edit <path> <content>        commit a change (needs GITHUB_TOKEN)",
  "  bans [<username>]            room bans: everyone banned, or one user",
  "  ban <username> <ROOMS>       ban from rooms (GLOBAL,POLITICS,… or ALL)",
  "  unban <username> [ROOM|ALL]  lift a ban (no room lifts every ban)",
  "  role <username>              show a role (set it with scripts/set-role.mjs)",
  "",
].join("\n");

/** Accept "true", "1", "yes", "on" or a bare flag (?flat) as true. */
export function toBool(v) {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  return ["true", "1", "yes", "on", ""].includes(String(v).toLowerCase());
}

/** The access-granted block every response leads with. */
export function accessHeader() {
  return {
    message  : `USER @${OWNER} authorized. API Key valid.`,
    granted  : true,
    owner    : OWNER,
    grantedAt: new Date().toISOString(),
  };
}

/** Render the payload as human-readable text (title, header, pretty body). */
export function renderPretty(payload) {
  const { message, granted, owner, grantedAt, count, ...data } = payload;
  const header = ["granted", "owner", "grantedAt", "count"]
    .map(k => `${k.padEnd(10)}: ${payload[k]}`);

  const keys = Object.keys(data);
  let body = null;
  if (keys.length === 1 && typeof data[keys[0]] === "string") {
    body = data[keys[0]]; // raw text body (tree, help, ...)
  } else if (keys.length) {
    body = JSON.stringify(data, null, 2);
  }

  const lines = [
    "=".repeat(70),
    message || "API response",
    "=".repeat(70),
    ...header,
  ];
  if (body !== null) lines.push("-".repeat(70), body);
  return lines.join("\n");
}

/** Render a payload as raw text — no banner, no header (data commands). */
export function renderData(payload) {
  const { message, granted, owner, grantedAt, count, ...data } = payload;
  const keys = Object.keys(data);
  if (keys.length === 1 && typeof data[keys[0]] === "string") return data[keys[0]];
  if (keys.length) return JSON.stringify(data, null, 2);
  return "";
}

/** Render the whoami command: key acceptance + access header details. */
export function renderWhoami(a, count) {
  const line = "-".repeat(70);
  return [
    line,
    a.message,
    line,
    `granted  : ${a.granted}`,
    `owner    : ${a.owner}`,
    `grantedAt: ${a.grantedAt}`,
    `count    : ${count}`,
  ].join("\n");
}

/** Walk a directory tree (dirs first, then files, alphabetical). */
export async function walkTree(dir, prefix, lines, isRoot) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return; }

  const dirs  = entries.filter(e => e.isDirectory() && !SKIP_TREE.has(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter(e => e.isFile())
    .sort((a, b) => a.name.localeCompare(b.name));

  const all = [...dirs, ...files];
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    const last = i === all.length - 1;
    lines.push((isRoot ? "" : prefix) + (last ? "└── " : "├── ") + e.name);
    if (e.isDirectory()) {
      await walkTree(join(dir, e.name), prefix + (last ? "    " : "│   "), lines, false);
    }
  }
}

function collectKeys(obj, prefix = "") {
  return Object.entries(obj || {}).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object" && !Array.isArray(v)
      ? collectKeys(v, path)
      : [path];
  });
}

/** Read a dotted path like "identity.city" from an object. */
function getAt(obj, path) {
  return String(path).split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

/** Fetch the repository tree from the GitHub API. */
async function githubTree() {
  const repo = process.env.GITHUB_REPO || GITHUB_DEFAULT;
  const [owner, name] = repo.split("/");
  const branch = process.env.GITHUB_BRANCH || "main";
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${name}/git/trees/${branch}?recursive=1`,
      {
        headers: { "User-Agent": "nag-shell", "Accept": "application/vnd.github+json" },
        signal : AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.tree)) return null;
    const entries = data.tree.filter(e => !e.path.startsWith("node_modules/"));
    return { owner, repo: name, truncated: !!data.truncated, entries };
  } catch {
    return null;
  }
}

/** Render a GitHub tree payload as box-drawing lines (dirs first, then files). */
function renderGitHubTree(data) {
  const node = {};
  for (const e of (data.entries || [])) {
    if (e.type !== "blob") continue;
    let cur = node;
    for (const part of e.path.split("/")) {
      if (!cur[part]) cur[part] = {};
      cur = cur[part];
    }
  }

  const lines = [`${data.owner}/${data.repo} (github)`];
  const walk = (obj, prefix) => {
    const dirs  = Object.keys(obj).filter(n => Object.keys(obj[n]).length > 0).sort();
    const files = Object.keys(obj).filter(n => Object.keys(obj[n]).length === 0).sort();
    const all   = [...dirs, ...files];
    for (let i = 0; i < all.length; i++) {
      const n    = all[i];
      const last = i === all.length - 1;
      const isDir = Object.keys(obj[n]).length > 0;
      lines.push(prefix + (last ? "└── " : "├── ") + n + (isDir ? "/" : ""));
      if (isDir) walk(obj[n], prefix + (last ? "    " : "│   "));
    }
  };
  walk(node, "");
  if (data.truncated) lines.push("", "(tree truncated by GitHub — large repo)");
  return lines;
}

/** Decode \\n and \\t escapes in shell-argument content. */
function decodeContent(s) {
  return s.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

/** GitHub repo/branch resolution + the contents endpoint. */
function githubRepo() {
  return {
    owner : (process.env.GITHUB_REPO || GITHUB_DEFAULT).split("/")[0],
    repo  : (process.env.GITHUB_REPO || GITHUB_DEFAULT).split("/")[1],
    branch: process.env.GITHUB_BRANCH || "main",
  };
}

/** Raw content URL of a repo file. */
function rawUrl(path) {
  const { owner, repo, branch } = githubRepo();
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

async function githubContents(path, raw = false) {
  const { owner, repo, branch } = githubRepo();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "nag-shell",
      Accept     : raw ? "application/vnd.github.raw" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(8000),
  });
  return res;
}

/** List a GitHub directory: dirs first, then files, alphabetical. */
async function githubList(path) {
  const res = await githubContents(path || "");
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data)) return null;
  const dirs  = data.filter(e => e.type === "dir").map(e => e.name + "/").sort();
  const files = data.filter(e => e.type === "file").map(e => e.name).sort();
  return [...dirs, ...files];
}

/** Write a file to GitHub via the Contents API (requires GITHUB_TOKEN). */
async function githubWrite(path, content, opts = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: "GITHUB_TOKEN not set on this deployment." };
  const { owner, repo, branch } = githubRepo();

  const info = await githubContents(path);
  let sha;
  if (info.ok) {
    try { sha = (await info.json()).sha; } catch { sha = undefined; }
  }

  if (opts.createOnly && sha) {
    return { ok: false, error: `${path} already exists — use 'edit' to update it.` };
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method : "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent" : "nag-shell",
      Accept       : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      message: `nag shell: ${path}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: `GitHub ${res.status}: ${body.message || res.statusText}` };
  }
  const data = await res.json();
  return { ok: true, sha: data.commit?.sha };
}

/**
 * Build a response payload from logs + query params
 * (supports userId, field [value], flat, keys, tree).
 */
export async function buildPayload(a, logs, params) {
  const { userId, field, value, flat, keys, tree } = params;
  let result = logs;

  if (userId)
    result = result.filter(e => e.user?.userId === String(userId).trim());

  if (field) {
    const parts = String(field).split(".");
    const get   = o => parts.reduce((acc, k) => acc?.[k], o);

    if (value !== undefined) {
      const want = String(value).toLowerCase();
      result = result.filter(e => {
        const got = get(e.user);
        return got !== undefined && String(got).toLowerCase() === want;
      });
    } else {
      const values = [...new Set(
        result
          .map(e => get(e.user))
          .filter(v => v !== undefined)
          .map(v => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)))
      )].sort();
      return { ...a, count: values.length, values };
    }
  }

  if (toBool(tree)) {
    const lines = [process.cwd()];
    await walkTree(process.cwd(), "", lines, true);
    return { ...a, count: lines.length - 1, tree: lines.join("\n") };
  }

  if (toBool(keys)) {
    const allKeys = [...new Set(result.flatMap(e => collectKeys(e.user)))].sort();
    return { ...a, count: allKeys.length, keys: allKeys };
  }

  if (toBool(flat)) {
    return { ...a, count: result.length, logs: result.map(e => e.user) };
  }

  return { ...a, count: result.length, logs: result };
}

/** Execute one shell command line against a fetched logs array. */
export async function runCommand(logs, line) {
  const [cmd, ...rest] = line.split(/\s+/);
  const a = accessHeader();

  if (!cmd) return "";
  if (cmd === "help" || cmd === "?") return HELP;
  if (cmd === "exit" || cmd === "quit" || cmd === "clear" || cmd === "cls") {
    return "Stateless shell — every request is a fresh session.";
  }

  if (cmd === "whoami") {
    return renderWhoami(a, logs.length);
  }

  if (cmd.startsWith("users=")) {
    const arg = cmd.slice("users=".length).trim();
    if (!arg) return "Usage: users=<userId>  |  users=<path>[.<val>] [<extra path>...]";

    // optional extra paths: users=<path>.<val> extra1 extra2 ...
    const extras = rest
      .flatMap(s => s.replace(/^\[|\]$/g, "").split(/\s+/))
      .filter(Boolean);

    // users=<userId> — show that user's record
    const idMatch = logs.filter(e => e.user?.userId === arg);
    if (idMatch.length) {
      return renderData({ ...a, count: idMatch.length, logs: idMatch.map(e => e.user) });
    }

    // users=<path>[.<val>] — each user's first field at that path (+ extra)
    const keySet = new Set(logs.flatMap(e => collectKeys(e.user)));
    const isKnown = p => keySet.has(p) || logs.some(e => getAt(e.user, p) != null);
    let path = arg;
    let val;
    if (!isKnown(arg) && arg.includes(".")) {
      const lastDot = arg.lastIndexOf(".");
      path = arg.slice(0, lastDot);
      val  = arg.slice(lastDot + 1);
    }
    if (!isKnown(path)) return `users: unknown path or user '${arg}'`;
    for (const x of extras) {
      if (!isKnown(x)) return `users: unknown extra path '${x}'`;
    }

    const want = val === undefined ? undefined : val.toLowerCase();
    const first = path.split(".")[0];
    const matched = logs.filter(e => {
      const got = getAt(e.user, path);
      return got != null && (want === undefined || String(got).toLowerCase() === want);
    });

    if (extras.length === 0) {
      // compact form (no extras): values + userIds only, no full JSON
      if (val === undefined) {
        const groups = new Map();
        let total = 0;
        for (const e of logs) {
          const id = e.user?.userId;
          if (id == null) continue;
          const got = getAt(e.user, path);
          const key = got == null ? "(null)" : (typeof got === "object" ? JSON.stringify(got) : String(got));
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(id);
          total++;
        }
        const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
        const out = renderData({ ...a, grouped: Object.fromEntries(sorted) });
        const noun = groups.size === 1 ? "value" : "values";
        return out + `\n${groups.size} ${noun} · ${total} users`;
      }

      const ids = matched.map(e => e.user?.userId).filter(Boolean);
      const out = renderData({ ...a, count: ids.length, userIds: ids });
      return out + `\n${ids.length} match${ids.length === 1 ? "" : "es"}`;
    }

    const list = matched.map(e => {
      const row = { userId: e.user?.userId, [first]: e.user?.[first] };
      for (const x of extras) {
        if (x !== first) row[x] = getAt(e.user, x);
      }
      return row;
    });
    const out = renderData({ ...a, count: list.length, matches: list });
    const note = val === undefined
      ? `${list.length} user${list.length === 1 ? "" : "s"}`
      : `${list.length} match${list.length === 1 ? "" : "es"}`;
    return out + "\n" + note;
  }

  if (cmd === "users") {
    const counts = new Map();
    for (const e of logs) {
      const id = e.user?.userId;
      if (id == null) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    if (!counts.size) return "no users";
    const rows = [...counts.entries()]
      .map(([id, n]) => String(id).padEnd(12) + " " + n + " record" + (n === 1 ? "" : "s"))
      .join("\n");
    return rows + `\n${counts.size} user${counts.size === 1 ? "" : "s"} · ${logs.length} record${logs.length === 1 ? "" : "s"}`;
  }

  if (cmd.startsWith("usersid=")) {
    const arg = cmd.slice("usersid=".length).trim();
    if (!arg) return "Usage: usersid=<path>[.<val>]";
    const known = new Set(logs.flatMap(e => collectKeys(e.user)));

    let path = arg;
    let val;
    if (!known.has(arg) && arg.includes(".")) {
      const lastDot = arg.lastIndexOf(".");
      path = arg.slice(0, lastDot);
      val  = arg.slice(lastDot + 1);
    }
    if (!known.has(path)) return `usersid: unknown path '${arg}'`;

    let list = logs
      .map(e => ({ userId: e.user?.userId, [path]: getAt(e.user, path) }))
      .filter(x => x[path] != null);
    if (val !== undefined) {
      const want = val.toLowerCase();
      list = list.filter(x => String(x[path]).toLowerCase() === want);
    }
    const out = renderData({ ...a, count: list.length, users: list });
    const note = val !== undefined
      ? `${list.length} match${list.length === 1 ? "" : "es"}`
      : `${list.length} users`;
    return out + "\n" + note;
  }

  if (cmd === "usersid") {
    const p = await buildPayload(a, logs, { flat: "true" });
    const ids = p.logs.map(u => u.userId).filter(Boolean);
    return JSON.stringify(ids, null, 2) + `\n${ids.length} userIds`;
  }

  if (cmd === "user" || cmd === "userid" || line.startsWith("userid=")) {
    let id = rest[0];
    if (line.startsWith("userid=")) id = line.slice("userid=".length).trim();
    if (!id) return "Usage: userid=<id>  |  user <id>";
    return renderData(await buildPayload(a, logs, { userId: id, flat: "true" }));
  }

  if (cmd === "flat") return renderData(await buildPayload(a, logs, { flat: "true" }));
  if (cmd === "keys") return renderData(await buildPayload(a, logs, { keys: "true" }));

  if (cmd === "tree") {
    const gh = await githubTree();
    if (gh) return renderData({ ...a, count: gh.entries.filter(e => e.type === "blob").length, tree: renderGitHubTree(gh).join("\n") });
    return renderData(await buildPayload(a, logs, { tree: "true" }));
  }

  if (cmd === "cat") {
    const path = rest[0];
    if (!path) return "Usage: cat <path>";
    try {
      const res = await githubContents(path, true);
      if (!res.ok) return `cat: ${path} — ${res.status} ${res.statusText}`;
      return await res.text();
    } catch {
      return `cat: ${path} — request failed`;
    }
  }

  if (cmd === "dir" || cmd === "ls") {
    const path = rest[0] || "";
    try {
      const list = await githubList(path);
      if (!list) return `dir: ${path || "/"} — not found`;
      return list.join("\n");
    } catch {
      return `dir: ${path || "/"} — request failed`;
    }
  }

  if (cmd === "edit") {
    const path = rest[0];
    const content = decodeContent(rest.slice(1).join(" "));
    if (!path || !content) return "Usage: edit <path> <content> (use \\n for newlines)";
    const r = await githubWrite(path, content);
    return r.ok ? `committed ${r.sha} — ${path}\nraw: ${rawUrl(path)}` : `edit: ${r.error}`;
  }

  if (cmd === "add") {
    const path = rest[0];
    const content = decodeContent(rest.slice(1).join(" "));
    if (!path || !content) return "Usage: add <path> <content> (use \\n for newlines)";
    const r = await githubWrite(path, content, { createOnly: true });
    return r.ok ? `created ${r.sha} — ${path}\nraw: ${rawUrl(path)}` : `add: ${r.error}`;
  }

  if (cmd === "field" || cmd === "fields") {
    // field — all possible fields
    if (!rest[0]) {
      const all = [...new Set(logs.flatMap(e => collectKeys(e.user)))].sort();
      return JSON.stringify(all, null, 2) + "\n" + `${all.length} fields`;
    }

    const arg = rest[0];
    if (!arg) return "Usage: field <path>[.<val>]  |  field <path> value <val>";

    // field <path> value <val> — filtered records
    const vIdx = rest.indexOf("value");
    if (vIdx !== -1 && rest[vIdx + 1]) {
      return renderData(await buildPayload(a, logs, { field: arg, value: rest[vIdx + 1] }));
    }

    // field <path>.<val> — users with that value + their info
    // (only when the arg is not itself an existing key path)
    const known = new Set(logs.flatMap(e => collectKeys(e.user)));
    if (!known.has(arg) && arg.includes(".")) {
      const lastDot = arg.lastIndexOf(".");
      const path    = arg.slice(0, lastDot);
      const val     = arg.slice(lastDot + 1);
      if (path && val && known.has(path)) {
        const want  = val.toLowerCase();
        const list  = logs
          .filter(e => {
            const got = getAt(e.user, path);
            return got !== undefined && String(got).toLowerCase() === want;
          })
          .map(e => ({ userId: e.user?.userId, [path.split(".")[0]]: e.user?.[path.split(".")[0]] }));
        return renderData({ ...a, count: list.length, matches: list })
          + "\n" + `${list.length} match${list.length === 1 ? "" : "es"}`;
      }
    }

    // Plain path → distinct values at that path
    return renderData(await buildPayload(a, logs, { field: arg }));
  }

  if (cmd === "bans" || cmd === "ban" || cmd === "unban" || cmd === "role") {
    return runModerationCommand(cmd, rest);
  }

  return `Unknown command: '${cmd}' — use 'help'.`;
}

/**
 * Room moderation commands (Postgres, via lib/moderation.js).
 * `role` only SHOWS a role: roles are changed by scripts/set-role.mjs, never
 * through an HTTP endpoint — and this shell is one.
 */
async function runModerationCommand(cmd, rest) {
  const usage = {
    bans: "Usage: bans [<username>]",
    ban: `Usage: ban <username> <ROOM[,ROOM...]>  (rooms: ${ROOMS.join(", ")}, ALL)`,
    unban: "Usage: unban <username> [ROOM|ALL]  (no room lifts every ban)",
    role: "Usage: role <username>  (read-only; change roles with scripts/set-role.mjs)",
  }[cmd];

  try {
    if (cmd === "bans" && !rest[0]) {
      const banned = await listBannedAccounts();
      return banned.length ? banned.map(acc => describeBans(acc)).join("\n") : "nobody is banned.";
    }
    if (!rest[0]) return usage;

    const account = await findAccountByUsername(rest[0]);
    if (!account) return `${cmd}: unknown user '${rest[0]}'`;
    if (cmd === "bans") return describeBans(account);
    if (cmd === "role") return `@${account.username} role: ${account.role}`;

    const rooms = rest.slice(1).join(",").split(",").map(s => s.trim()).filter(Boolean);
    const bad = invalidRooms(rooms);
    if (bad.length) return `${cmd}: invalid room ${bad.join(", ")} (valid: ${ROOMS.join(", ")}, ALL)`;
    if (cmd === "ban" && !rooms.length) return usage;

    const bans = cmd === "ban" ? await banAccount(account, rooms) : await unbanAccount(account, rooms);
    return `${cmd === "ban" ? "banned" : "unbanned"}. ${describeBans(account, bans)}`;
  } catch (err) {
    return `${cmd}: ${err.message}`;
  }
}

/**
 * Build the full shell endpoint handler around a Redis client.
 *
 * opts.mode:
 *   "shell" (default) — landing shows the shell banner + help
 *   "logs"            — landing shows the formatted JSON of all logs
 * Commands (?cmd= / POST), legacy params and ?browser=open work in both.
 */
export function createShellHandler(kv, opts = {}) {
  const mode = opts.mode === "logs" ? "logs" : "shell";
  return async function router(req, res) {
    // ── Browser mode: ?browser=open → the shell page. Served WITHOUT a key:
    //    the page itself asks for the API key first (a ?key= in the URL is
    //    ignored by the page) and holds the session until "exit". ──
    if (req.method === "GET" && req.query?.browser === "open") {
      const ua = String(req.headers?.["user-agent"] || "").toLowerCase();
      const isBrowser = /mozilla|chrome|safari|firefox|edg|opera|webkit|vivaldi|android|iphone|ipad/i.test(ua);

      if (!isBrowser) {
        const proto = req.headers?.["x-forwarded-proto"] || "https";
        const host  = req.headers?.["host"] || "nagora.vercel.app";
        const url   = `${proto}://${host}${req.url}`;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.status(200).send([
          "nag shell is a browser terminal — open it in your browser:",
          "",
          "  " + url,
          "",
          "(curl receives this message; browsers get the interactive page.)",
        ].join("\n"));
        return;
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(SHELL_PAGE);
      return;
    }

    return requireApiKey(async function handler(req, res) {
      if (!["GET", "POST"].includes(req.method)) {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const sendText = text => {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.status(200).send(text);
      };

      try {
      const userIds = await kv.smembers(USERIDS);
      const users = userIds && userIds.length
        ? await Promise.all(userIds.map(id => kv.get(userKey(id))))
        : [];
      const logs = users.filter(Boolean).map(u => ({ user: u }));

      // ── Command mode (curl-style shell) ─────────────
      let lines = [];
      if (req.method === "GET" && req.query?.cmd) {
        lines = [String(req.query.cmd)];
      } else if (req.method === "POST") {
        const body = req.body;
        if (typeof body === "string") {
          lines = body.split("\n");
        } else if (body && Array.isArray(body.commands)) {
          lines = body.commands.map(String);
        } else if (body && typeof body.cmd === "string") {
          lines = [body.cmd];
        }
      }

      if (lines.length) {
        const outputs = [];
        for (const line of lines) {
          const out = await runCommand(logs, line.trim());
          if (out) outputs.push(lines.length > 1 ? `$ ${line.trim()}\n${out}` : out);
        }
        sendText(outputs.join("\n\n"));
        return;
      }

      // ── Legacy param mode (?flat=true, ?userId=…, …) ─
      if (LEGACY_PARAMS.some(k => req.query[k] !== undefined)) {
        const payload = await buildPayload(accessHeader(), logs, req.query);
        sendText(renderPretty(payload));
        return;
      }

      // ── Landing: no params → mode decides ──────────
      if (mode === "logs") {
        const payload = await buildPayload(accessHeader(), logs, req.query);
        sendText(renderPretty(payload));
        return;
      }
      sendText(HELP);
    } catch (err) {
      console.error("[api/shell] Error:", err);
      res.status(500).json({ error: err.message });
    }
    })(req, res);
  };
}
