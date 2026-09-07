let me = null;
let selectedUser = null;
let pollInterval = null;
let lastMessageId = null;
let typingDebounceTimer = null;
let lastTypingPost = 0;

const userList = document.getElementById("user-list");
const dmPlaceholder = document.getElementById("dm-placeholder");
const dmPanel = document.getElementById("dm-panel");
const dmUsername = document.getElementById("dm-username");
const dmStatus = document.getElementById("dm-status");
const dmTyping = document.getElementById("dm-typing");
const dmMessages = document.getElementById("dm-messages");
const dmInput = document.getElementById("dm-input");
const dmSend = document.getElementById("dm-send");
const dmAttach = document.getElementById("dm-attach");
const dmAttachMenu = document.getElementById("dm-attach-menu");

async function initSession() {
  try {
    const r = await fetch("/api/me", { credentials: "include" });
    if (!r.ok) {
      location.href = "index.html";
      return;
    }
    const data = await r.json();
    if (!data.ok) {
      location.href = "index.html";
      return;
    }
    me = { username: data.username, userId: data.userId };
  } catch (e) {
    console.warn("[app] initSession:", e);
    location.href = "index.html";
  }
}

async function fetchUsers() {
  try {
    const r = await fetch("/api/users", { credentials: "include" });
    if (!r.ok) throw new Error("users fetch failed");
    const { users } = await r.json();
    renderUsers(users);
  } catch (e) {
    console.warn("[app] fetchUsers:", e);
  }
}

function renderUsers(users) {
  userList.innerHTML = "";
  for (const u of users) {
    const row = document.createElement("div");
    row.className = "user-row";
    row.dataset.username = u.username;
    row.dataset.userid = u.userId;

    const dot = document.createElement("span");
    dot.className = `status-dot ${u.online ? "online" : "offline"}`;
    dot.title = u.online ? "online" : "offline";

    const name = document.createElement("span");
    name.className = "username";
    name.textContent = u.username;

    row.appendChild(dot);
    row.appendChild(name);

    if (u.userId) {
      row.addEventListener("click", () => selectUser(u));
    }

    userList.appendChild(row);
  }
}

function selectUser(user) {
  for (const el of userList.querySelectorAll(".user-row")) {
    el.classList.remove("active");
  }
  const row = userList.querySelector(`.user-row[data-userid="${user.userId}"]`);
  if (row) row.classList.add("active");

  selectedUser = user;
  dmPlaceholder.hidden = true;
  dmPanel.hidden = false;
  dmUsername.textContent = user.username;
  dmStatus.className = `status-dot ${user.online ? "online" : "offline"}`;
  dmTyping.textContent = "";
  dmMessages.innerHTML = "";
  lastMessageId = null;

  markRead(user.userId);
  startPoll();
}

async function markRead(userId) {
  try {
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "read", with: userId }),
    });
  } catch (e) {
    console.warn("[app] markRead:", e);
  }
}

function renderMessages(messages) {
  dmMessages.innerHTML = "";
  for (const m of messages) {
    const bubble = document.createElement("div");
    bubble.className = `dm-bubble ${m.senderId === me.userId ? "own" : "other"}`;

    const text = document.createElement("div");
    text.textContent = m.content;

    const meta = document.createElement("div");
    meta.className = "dm-meta";
    meta.textContent = new Date(m.createdAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    bubble.appendChild(text);
    bubble.appendChild(meta);
    dmMessages.appendChild(bubble);
  }
  dmMessages.scrollTop = dmMessages.scrollHeight;
}

async function pollConversation() {
  if (!selectedUser || document.visibilityState !== "visible") return;

  try {
    const r = await fetch(`/api/messages?with=${encodeURIComponent(selectedUser.userId)}&limit=50`, {
      credentials: "include",
    });
    if (!r.ok) throw new Error("messages fetch failed");
    const data = await r.json();

    const last = data.messages[data.messages.length - 1];
    if (last && last.id !== lastMessageId) {
      renderMessages(data.messages);
      lastMessageId = last.id;
    }

    dmTyping.textContent = data.typing ? "digitando…" : "";
  } catch (e) {
    console.warn("[app] pollConversation:", e);
  }
}

function startPoll() {
  if (pollInterval) return;
  pollConversation();
  pollInterval = setInterval(pollConversation, 500);
}

function stopPoll() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function postTyping(typing) {
  if (!selectedUser) return;
  try {
    await fetch("/api/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        recipientUserId: selectedUser.userId,
        typing,
      }),
    });
  } catch (e) {
    console.warn("[app] postTyping:", e);
  }
}

async function sendMessage() {
  if (!selectedUser) return;
  const content = String(dmInput.value).trim();
  if (!content) return;

  dmInput.value = "";
  clearTimeout(typingDebounceTimer);
  await postTyping(false);

  try {
    const r = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "send",
        recipientUserId: selectedUser.userId,
        content,
      }),
    });
    if (!r.ok) throw new Error("send failed");
    await pollConversation();
  } catch (e) {
    console.warn("[app] sendMessage:", e);
  }
}

dmInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

dmSend.addEventListener("click", sendMessage);

dmInput.addEventListener("input", async () => {
  if (!selectedUser) return;
  const value = String(dmInput.value).trim();

  if (!value) {
    clearTimeout(typingDebounceTimer);
    await postTyping(false);
    return;
  }

  if (Date.now() - lastTypingPost > 2000) {
    lastTypingPost = Date.now();
    await postTyping(true);
  }

  clearTimeout(typingDebounceTimer);
  typingDebounceTimer = setTimeout(async () => {
    await postTyping(false);
  }, 2500);
});

dmAttach.addEventListener("click", () => {
  dmAttachMenu.classList.toggle("hidden-field");
});

async function heartbeat() {
  try {
    await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
  } catch (e) {
    console.warn("[app] heartbeat:", e);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    stopPoll();
  } else if (selectedUser) {
    startPoll();
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  await initSession();
  if (!me) return;

  fetchUsers();
  heartbeat();
  setInterval(heartbeat, 60000);
  setInterval(fetchUsers, 30000);
});
