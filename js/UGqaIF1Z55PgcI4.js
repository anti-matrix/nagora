let me = null;
let selectedUser = null;
let pollInterval = null;
let lastMessageId = null;
const MESSAGE_PAGE_LIMIT = 50;
const NEAR_BOTTOM_THRESHOLD = 60;
const LOAD_OLDER_THRESHOLD = 80;

let messageList = [];
let oldestLoadedId = null;
let noMoreOlder = false;
let loadingOlder = false;
let conversationEpoch = 0;

let typingDebounceTimer = null;
let lastTypingPost = 0;
let replyingTo = null;
let drawerOpen = false;

let social = {
  friendIds: new Set(),
  incoming: new Map(),
  outgoing: new Map(),
};
let searchTerm = "";
let profileExpanded = false;
let bubbleUser = null;
let usersCache = [];
let socialInterval = null;
let badgeInterval = null;

let audioRecorder = null;
let audioChunks = [];
let audioRecordStartTs = 0;
let audioRecordTimer = null;
let audioRecording = false;
let recordingIntent = false;
const MAX_AUDIO_MS = 5 * 60 * 1000;

let avatarEpoch = 0;

let contactPanelOpen = false;
let currentContact = null;

// Client token layer (defense-in-depth header auth)
let clientToken = null;
let clientTokenExpiry = 0;
let tokenRefreshPromise = null;

async function fetchHandshake() {
  const r = await fetch("/api/handshake", { credentials: "include" });
  if (!r.ok) throw new Error("handshake failed");
  const data = await r.json();
  if (!data.ok || !data.token) throw new Error("handshake missing token");
  clientToken = data.token;
  clientTokenExpiry = data.expiresAt ? Date.parse(data.expiresAt) : Date.now() + 14 * 60 * 1000;
  return clientToken;
}

async function ensureClientToken() {
  if (clientToken && Date.now() < clientTokenExpiry - 60000) return clientToken;
  if (tokenRefreshPromise) return tokenRefreshPromise;
  tokenRefreshPromise = fetchHandshake().finally(() => { tokenRefreshPromise = null; });
  return tokenRefreshPromise;
}

function clearClientToken() {
  clientToken = null;
  clientTokenExpiry = 0;
}

async function authFetch(url, options = {}) {
  const doFetch = async () => {
    const token = await ensureClientToken();
    const headers = new Headers(options.headers);
    headers.set("X-NAGORA-Token", token);
    return fetch(url, { ...options, headers });
  };

  let res = await doFetch();
  if (res.status === 401) {
    clearClientToken();
    try {
      res = await doFetch();
    } catch {
      location.href = "index.html";
      return new Response(null, { status: 401 });
    }
    if (res.status === 401) {
      location.href = "index.html";
      return new Response(null, { status: 401 });
    }
  }
  return res;
}

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
const dmImageInput = document.getElementById("dm-image-input");
const dmImageBtn = document.getElementById("dm-image-btn");
const dmLightbox = document.getElementById("dm-lightbox");
const dmLightboxImg = document.getElementById("dm-lightbox-img");
const dmLightboxClose = document.getElementById("dm-lightbox-close");

const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const menuBtn = document.getElementById("dm-menu-btn");
const placeholderMenuBtn = document.getElementById("dm-placeholder-menu-btn");
const replyBar = document.getElementById("dm-reply-bar");
const replyName = document.getElementById("dm-reply-name");
const replySnippet = document.getElementById("dm-reply-snippet");
const replyCancel = document.getElementById("dm-reply-cancel");

const searchToggle = document.getElementById("search-toggle");
const searchBox = document.getElementById("search-box");
const searchInput = document.getElementById("search-input");

const profileCard = document.getElementById("profile-card");
const profileSummary = document.getElementById("profile-summary");
const profileName = document.getElementById("profile-name");
const profileHandle = document.getElementById("profile-handle");
const profileBody = document.getElementById("profile-body");
const profileBadge = document.getElementById("profile-badge");
const shownameInput = document.getElementById("showname-input");
const shownameSave = document.getElementById("showname-save");
const profileLogout = document.getElementById("profile-logout");
const profileMessage = document.getElementById("profile-message");
const profileRequests = document.getElementById("profile-requests");
const profileRequestsList = document.getElementById("profile-requests-list");

const logoutConfirmOverlay = document.getElementById("logout-confirm-overlay");
const logoutConfirm = document.getElementById("logout-confirm");
const logoutConfirmCancel = document.getElementById("logout-confirm-cancel");
const logoutConfirmOk = document.getElementById("logout-confirm-ok");

const userBubble = document.getElementById("user-bubble");
const userBubbleClose = document.getElementById("user-bubble-close");
const userBubbleName = document.getElementById("user-bubble-name");
const userBubbleHandle = document.getElementById("user-bubble-handle");
const userBubbleActions = document.getElementById("user-bubble-actions");

const dmAudio = document.getElementById("dm-audio");
const profileIcon = document.querySelector(".profile-icon");
const profileAvatar = document.querySelector(".profile-avatar");
const profileAvatarInput = document.getElementById("profile-avatar-input");
const dmHeader = document.getElementById("dm-header");
const dmHeaderAvatar = document.getElementById("dm-header-avatar");
const contactPanel = document.getElementById("contact-panel");
const contactPanelOverlay = document.getElementById("contact-panel-overlay");
const contactPanelClose = document.getElementById("contact-panel-close");
const contactPanelAvatar = document.getElementById("contact-panel-avatar");
const contactName = document.getElementById("contact-name");
const contactHandle = document.getElementById("contact-handle");
const contactStatus = document.getElementById("contact-status");
const contactFriendsSince = document.getElementById("contact-friends-since");
const contactFirstConversation = document.getElementById("contact-first-conversation");

const URL_RE = /https:\/\/[^\s<>"{}|\\^`\[\]]+/g;

function displayName(u) {
  return u.showname || u.username;
}

function avatarUrl(userId, hasAvatar) {
  if (!hasAvatar) return null;
  return `/api/avatar?userId=${encodeURIComponent(userId)}&v=${avatarEpoch}`;
}

function setAvatarOrFallback(container, userId, hasAvatar, imgClass) {
  container.innerHTML = "";
  if (!hasAvatar) {
    container.innerHTML = '<i class="bi bi-person-circle"></i>';
    return;
  }
  const img = document.createElement("img");
  img.src = avatarUrl(userId, true);
  img.alt = "";
  img.className = imgClass;
  img.onerror = () => { container.innerHTML = '<i class="bi bi-person-circle"></i>'; };
  container.appendChild(img);
}

async function answerRequest(targetUserId, action) {
  try {
    const r = await authFetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action, targetUserId }),
    });
    if (!r.ok) throw new Error(`${action} failed`);
    await fetchSocial();
    return true;
  } catch (e) {
    console.warn(`[app] ${action} request:`, e);
    return false;
  }
}

function appendLinkifiedText(text, parent) {
  let lastIndex = 0;
  let match;
  while ((match = URL_RE.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) parent.appendChild(document.createTextNode(before));

    let url = match[0].replace(/[.,;:!?]+$/, "");
    if (url.endsWith(")")) url = url.slice(0, -1);

    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "dm-link";
    a.textContent = url;
    parent.appendChild(a);

    lastIndex = match.index + match[0].length;
  }
  const tail = text.slice(lastIndex);
  if (tail) parent.appendChild(document.createTextNode(tail));
}

async function initSession() {
  try {
    const r = await fetch("/api/handshake", { credentials: "include" });
    if (!r.ok) {
      location.href = "index.html";
      return;
    }
    const data = await r.json();
    if (!data.ok || !data.token) {
      location.href = "index.html";
      return;
    }
    me = { username: data.username, userId: data.userId, showname: data.showname || null, hasAvatar: data.hasAvatar || false };
    clientToken = data.token;
    clientTokenExpiry = data.expiresAt ? Date.parse(data.expiresAt) : Date.now() + 14 * 60 * 1000;
  } catch (e) {
    console.warn("[app] initSession:", e);
    location.href = "index.html";
  }
}

async function fetchSocial() {
  if (!me) return;
  try {
    const [usersRes, friendsRes, incomingRes, outgoingRes] = await Promise.all([
      authFetch("/api/users", { credentials: "include" }),
      authFetch("/api/friends?type=friends", { credentials: "include" }),
      authFetch("/api/friends?type=incoming", { credentials: "include" }),
      authFetch("/api/friends?type=outgoing", { credentials: "include" }),
    ]);

    if (!usersRes.ok) throw new Error("users fetch failed");
    const { users } = await usersRes.json();
    usersCache = users || [];

    if (friendsRes.ok) {
      const { users: friends } = await friendsRes.json();
      social.friendIds = new Set((friends || []).map(u => u.userId));
    }
    if (incomingRes.ok) {
      const { requests } = await incomingRes.json();
      social.incoming = new Map((requests || []).map(r => [r.senderId, r]));
    }
    if (outgoingRes.ok) {
      const { requests } = await outgoingRes.json();
      social.outgoing = new Map((requests || []).map(r => [r.recipientId, r]));
    }

    renderUsers(usersCache);
    renderProfileBadge();
    renderIncomingRequests();
  } catch (e) {
    console.warn("[app] fetchSocial:", e);
  }
}

async function fetchIncomingBadge() {
  if (!me) return;
  try {
    const r = await authFetch("/api/friends?type=incoming", { credentials: "include" });
    if (!r.ok) return;
    const { requests } = await r.json();
    social.incoming = new Map((requests || []).map(req => [req.senderId, req]));
    renderProfileBadge();
    renderIncomingRequests();
    if (bubbleUser) renderBubble();
  } catch (e) {
    console.warn("[app] fetchIncomingBadge:", e);
  }
}

function renderUsers(users) {
  userList.innerHTML = "";

  const filtered = (users || []).filter(u => {
    if (u.userId === me?.userId) return false;
    if (!searchTerm) return true;
    return u.username.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (searchTerm && !filtered.length) {
    const none = document.createElement("div");
    none.className = "user-row no-results";
    none.textContent = "Nenhum usuário encontrado";
    userList.appendChild(none);
    return;
  }

  for (const u of filtered) {
    const row = document.createElement("div");
    row.className = "user-row";
    row.dataset.username = u.username;
    row.dataset.userid = u.userId;

    const avatarWrap = document.createElement("span");
    avatarWrap.className = "user-row-avatar";
    setAvatarOrFallback(avatarWrap, u.userId, u.hasAvatar, "");

    const dot = document.createElement("span");
    dot.className = `status-dot ${u.online ? "online" : "offline"}`;
    dot.title = u.online ? "online" : "offline";

    const name = document.createElement("span");
    name.className = "username";
    name.textContent = displayName(u);

    row.appendChild(avatarWrap);
    row.appendChild(dot);
    row.appendChild(name);

    if (u.userId) {
      row.addEventListener("click", () => handleUserRowClick(u));
    }

    userList.appendChild(row);
  }
}

function handleUserRowClick(user) {
  if (social.friendIds.has(user.userId)) {
    selectUser(user);
  } else {
    openBubble(user);
  }
}

async function selectUser(user) {
  closeBubble();
  for (const el of userList.querySelectorAll(".user-row")) {
    el.classList.remove("active");
  }
  const row = userList.querySelector(`.user-row[data-userid="${user.userId}"]`);
  if (row) row.classList.add("active");

  selectedUser = user;
  dmPlaceholder.hidden = true;
  dmPanel.hidden = false;
  dmUsername.textContent = displayName(user);
  dmUsername.dataset.userid = user.userId;
  setAvatarOrFallback(dmHeaderAvatar, user.userId, user.hasAvatar, "avatar-img");
  dmStatus.className = `status-dot ${user.online ? "online" : "offline"}`;
  dmTyping.textContent = "";
  dmMessages.innerHTML = "";
  dmMessages.classList.remove("loading-older");

  messageList = [];
  oldestLoadedId = null;
  noMoreOlder = false;
  loadingOlder = false;
  lastMessageId = null;
  conversationEpoch++;

  markRead(user.userId);
  stopPoll();
  await pollConversation();
  startPoll();
  closeDrawer();
}

function openDrawer() {
  sidebar.classList.add("open");
  sidebarOverlay.hidden = false;
  menuBtn.setAttribute("aria-expanded", "true");
  menuBtn.setAttribute("aria-label", "Fechar lista de usuários");
  drawerOpen = true;
  const activeRow = userList.querySelector(".user-row.active");
  (activeRow || userList.querySelector(".user-row"))?.focus();
}

function closeDrawer() {
  sidebar.classList.remove("open");
  sidebarOverlay.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.setAttribute("aria-label", "Abrir lista de usuários");
  drawerOpen = false;
  if (!dmPanel.hidden) {
    menuBtn.focus();
  } else {
    placeholderMenuBtn?.focus();
  }
}

menuBtn.addEventListener("click", () => {
  if (drawerOpen) closeDrawer(); else openDrawer();
});
placeholderMenuBtn.addEventListener("click", openDrawer);

sidebarOverlay.addEventListener("click", closeDrawer);

async function markRead(userId) {
  try {
    await authFetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "read", with: userId }),
    });
  } catch (e) {
    console.warn("[app] markRead:", e);
  }
}

function snippet(replyTo) {
  if (replyTo.content) {
    return replyTo.content.length > 80
      ? replyTo.content.slice(0, 80) + "…"
      : replyTo.content;
  }
  if (replyTo.mediaType?.startsWith("image/")) return "(imagem)";
  if (replyTo.mediaType?.startsWith("audio/")) return "(áudio)";
  return "(mídia)";
}

function setReply(message) {
  let senderUsername;
  if (message.senderId === me.userId) {
    senderUsername = displayName(me);
  } else if (selectedUser && selectedUser.userId === message.senderId) {
    senderUsername = displayName(selectedUser);
  } else {
    senderUsername = message.senderUsername || message.senderId;
  }
  replyingTo = {
    id: message.id,
    senderId: message.senderId,
    senderUsername,
    content: message.content,
    mediaType: message.mediaType,
  };
  renderReplyBar();
  dmInput.focus();
}

function clearReply() {
  replyingTo = null;
  renderReplyBar();
}

function renderReplyBar() {
  if (!replyingTo) {
    replyBar.hidden = true;
    return;
  }
  replyName.textContent = replyingTo.senderUsername;
  replySnippet.textContent = snippet(replyingTo);
  replyBar.hidden = false;
}

function jumpToMessage(id) {
  const target = dmMessages.querySelector(`.dm-bubble[data-id="${id}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("dm-bubble-highlight");
  setTimeout(() => target.classList.remove("dm-bubble-highlight"), 1500);
}

function createImageBubble(messageId) {
  const wrap = document.createElement("div");
  wrap.className = "dm-media-wrap";

  const img = document.createElement("img");
  img.src = `/api/file?id=${encodeURIComponent(messageId)}`;
  img.alt = "Imagem";

  const spinner = document.createElement("div");
  spinner.className = "dm-image-spinner";
  spinner.setAttribute("aria-hidden", "true");

  const error = document.createElement("div");
  error.className = "dm-image-error";
  error.textContent = "Falha ao carregar imagem";

  function reveal() {
    wrap.classList.add("loaded");
  }

  function onError() {
    wrap.classList.add("error");
  }

  img.addEventListener("load", reveal);
  img.addEventListener("error", onError);

  // Already cached/decoded: skip the spinner flash.
  if (img.complete && img.naturalWidth > 0) {
    reveal();
  }

  wrap.appendChild(spinner);
  wrap.appendChild(error);
  wrap.appendChild(img);
  return wrap;
}

function createAudioBubble(message) {
  const wrap = document.createElement("div");
  wrap.className = "dm-audio-wrap";
  const audio = document.createElement("audio");
  audio.controls = true;
  audio.src = `/api/file?id=${encodeURIComponent(message.id)}`;
  audio.preload = "metadata";
  const duration = document.createElement("span");
  duration.className = "dm-audio-duration";
  duration.textContent = message.mediaDurationMs ? formatAudioDuration(message.mediaDurationMs) : "0:00";
  wrap.appendChild(audio);
  wrap.appendChild(duration);
  return wrap;
}

function renderMessages(options = {}) {
  const scrollMode = options.scroll || "bottom";

  let wasNearBottom = false;
  let oldScrollTop = 0;
  if (scrollMode === "auto") {
    const distanceToBottom =
      dmMessages.scrollHeight - dmMessages.scrollTop - dmMessages.clientHeight;
    wasNearBottom = distanceToBottom <= NEAR_BOTTOM_THRESHOLD;
    oldScrollTop = dmMessages.scrollTop;
  }

  dmMessages.innerHTML = "";

  for (const m of messageList) {
    const bubble = document.createElement("div");
    bubble.className = `dm-bubble ${m.senderId === me.userId ? "own" : "other"}${m.mediaType ? " media" : ""}`;
    bubble.dataset.id = m.id;

    if (m.replyTo) {
      const quote = document.createElement("div");
      quote.className = "dm-quote";
      quote.dataset.id = m.replyTo.id;

      const quoteName = document.createElement("div");
      quoteName.className = "dm-quote-name";
      quoteName.textContent = m.replyTo.senderUsername;

      const quoteText = document.createElement("div");
      quoteText.className = "dm-quote-text";
      appendLinkifiedText(snippet(m.replyTo), quoteText);

      quote.appendChild(quoteName);
      quote.appendChild(quoteText);
      quote.addEventListener("click", (e) => {
        e.stopPropagation();
        jumpToMessage(m.replyTo.id);
      });
      bubble.appendChild(quote);
    }

    if (m.mediaType) {
      if (m.mediaType.startsWith("audio/")) {
        bubble.appendChild(createAudioBubble(m));
      } else {
        bubble.appendChild(createImageBubble(m.id));
      }
    }

    if (m.content) {
      const text = document.createElement("div");
      appendLinkifiedText(m.content, text);
      bubble.appendChild(text);
    }

    const meta = document.createElement("div");
    meta.className = "dm-meta";
    meta.textContent = new Date(m.createdAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    bubble.appendChild(meta);

    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.className = "dm-reply-btn";
    replyBtn.setAttribute("aria-label", "Responder");
    replyBtn.innerHTML = '<i class="bi bi-reply"></i>';
    replyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setReply(m);
    });
    bubble.appendChild(replyBtn);

    dmMessages.appendChild(bubble);
  }

  if (scrollMode === "bottom" || (scrollMode === "auto" && wasNearBottom)) {
    dmMessages.scrollTop = dmMessages.scrollHeight;
  } else if (scrollMode === "preserve") {
    // caller sets the exact compensated scrollTop after prepend
  } else if (scrollMode === "auto") {
    dmMessages.scrollTop = oldScrollTop;
  }
}

function showImageError(msg) {
  dmTyping.textContent = msg;
  setTimeout(() => {
    if (dmTyping.textContent === msg) dmTyping.textContent = "";
  }, 3000);
}

function formatAudioDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function cleanupAudioRecording() {
  if (audioRecorder && audioRecorder.state !== "inactive") {
    try { audioRecorder.stop(); } catch {}
  }
  if (audioRecorder?.stream) {
    audioRecorder.stream.getTracks().forEach(t => t.stop());
  }
  audioRecorder = null;
  audioChunks = [];
  clearInterval(audioRecordTimer);
  audioRecordTimer = null;
  audioRecording = false;
  recordingIntent = false;
  dmAudio.classList.remove("recording");
  dmAudio.setAttribute("aria-label", "Áudio");
}

async function startAudioRecording() {
  if (!selectedUser) return;
  if (recordingIntent) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    showImageError("Seu navegador não suporta gravação de áudio.");
    return;
  }
  recordingIntent = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!recordingIntent) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
    if (!mimeType) {
      stream.getTracks().forEach(t => t.stop());
      recordingIntent = false;
      showImageError("Formato de áudio não suportado pelo navegador.");
      return;
    }
    const options = { mimeType };
    if (mimeType.includes("opus")) {
      options.audioBitsPerSecond = 24000;
    }
    audioRecorder = new MediaRecorder(stream, options);
    audioChunks = [];
    audioRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };
    audioRecorder.onerror = () => {
      console.warn("[app] MediaRecorder error");
      cleanupAudioRecording();
      showImageError("Falha na gravação de áudio.");
    };
    audioRecorder.start(100);
    audioRecordStartTs = Date.now();
    audioRecording = true;
    dmAudio.classList.add("recording");
    dmAudio.setAttribute("aria-label", "Gravando áudio");
    audioRecordTimer = setInterval(() => {
      if (Date.now() - audioRecordStartTs >= MAX_AUDIO_MS) stopAudioRecording(true);
    }, 250);
  } catch (e) {
    recordingIntent = false;
    console.warn("[app] startAudioRecording:", e);
    showImageError("Não foi possível acessar o microfone.");
  }
}

function stopAudioRecording(send) {
  recordingIntent = false;
  if (!audioRecorder) return;
  const recorder = audioRecorder;
  const chunks = audioChunks;
  const mimeType = recorder.mimeType || "audio/webm";
  const durationMs = Date.now() - audioRecordStartTs;

  if (recorder.state === "inactive") {
    cleanupAudioRecording();
    return;
  }

  recorder.onstop = () => {
    recorder.stream?.getTracks().forEach(t => t.stop());
    cleanupAudioRecording();
    if (!send) return;
    if (chunks.length === 0 || durationMs < 500) {
      showImageError("Áudio muito curto.");
      return;
    }
    const blob = new Blob(chunks, { type: mimeType });
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = String(reader.result).split(",")[1];
      try {
        await uploadAudioBase64(base64, durationMs, mimeType);
      } catch (e) {
        console.warn("[app] audio upload:", e);
        showImageError(e.message || "Falha ao enviar áudio.");
      }
    };
    reader.readAsDataURL(blob);
  };
  recorder.stop();
}

async function uploadAudioBase64(audioBase64, durationMs, mimeType) {
  const r = await authFetch("/api/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      recipientUserId: selectedUser.userId,
      audioBase64,
      durationMs,
      mediaType: mimeType,
      replyToId: replyingTo?.id,
    }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || "upload failed");
  }
  clearReply();
  await pollConversation();
}

function openLightbox(src) {
  dmLightboxImg.src = src;
  dmLightbox.hidden = false;
  dmLightboxClose.focus();
}

function closeLightbox() {
  dmLightbox.hidden = true;
  dmLightboxImg.src = "";
}

function downscaleImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

function downscaleAvatar(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = 128;
      const scale = size / Math.max(img.naturalWidth, img.naturalHeight);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

function openAvatarPicker() {
  profileAvatarInput.click();
}

async function uploadImageBase64(imageBase64) {
  const r = await authFetch("/api/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      recipientUserId: selectedUser.userId,
      imageBase64,
      replyToId: replyingTo?.id,
    }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || "upload failed");
  }
  clearReply();
  await pollConversation();
}

async function pollConversation() {
  if (!selectedUser || document.visibilityState !== "visible") return;

  const epoch = conversationEpoch;

  try {
    const r = await authFetch(
      `/api/messages?with=${encodeURIComponent(selectedUser.userId)}&limit=${MESSAGE_PAGE_LIMIT}`,
      { credentials: "include" }
    );
    if (!r.ok) throw new Error("messages fetch failed");
    const data = await r.json();

    if (epoch !== conversationEpoch) return;

    const fetched = data.messages || [];

    if (messageList.length === 0) {
      messageList = fetched.slice();
      if (messageList.length > 0) {
        oldestLoadedId = messageList[0].id;
        lastMessageId = messageList[messageList.length - 1].id;
      }
      noMoreOlder = fetched.length < MESSAGE_PAGE_LIMIT;
      renderMessages({ scroll: "bottom" });
    } else {
      const newMessages = fetched.filter((m) => m.id > lastMessageId);
      if (newMessages.length > 0) {
        messageList = messageList.concat(newMessages);
        lastMessageId = messageList[messageList.length - 1].id;
        renderMessages({ scroll: "auto" });
      }
    }

    dmTyping.textContent = data.typing ? "digitando…" : "";
  } catch (e) {
    console.warn("[app] pollConversation:", e);
  }
}

async function loadOlder() {
  if (!selectedUser || noMoreOlder || loadingOlder) return;
  if (messageList.length === 0 || oldestLoadedId == null) return;

  const epoch = conversationEpoch;
  loadingOlder = true;
  showOlderLoader(true);

  try {
    const r = await authFetch(
      `/api/messages?with=${encodeURIComponent(selectedUser.userId)}&before=${encodeURIComponent(oldestLoadedId)}&limit=${MESSAGE_PAGE_LIMIT}`,
      { credentials: "include" }
    );
    if (!r.ok) throw new Error("older messages fetch failed");
    const data = await r.json();

    if (epoch !== conversationEpoch) return;

    const older = data.messages || [];

    if (older.length === 0) {
      noMoreOlder = true;
      return;
    }

    showOlderLoader(false);

    const oldScrollHeight = dmMessages.scrollHeight;
    const oldScrollTop = dmMessages.scrollTop;

    messageList = older.concat(messageList);
    oldestLoadedId = messageList[0].id;
    noMoreOlder = older.length < MESSAGE_PAGE_LIMIT;

    renderMessages({ scroll: "preserve" });
    dmMessages.scrollTop = oldScrollTop + (dmMessages.scrollHeight - oldScrollHeight);
  } catch (e) {
    console.warn("[app] loadOlder:", e);
  } finally {
    if (epoch === conversationEpoch) {
      loadingOlder = false;
      showOlderLoader(false);
    }
  }
}

function showOlderLoader(show) {
  dmMessages.classList.toggle("loading-older", show);
}

function startPoll() {
  pollConversation();
  if (pollInterval) return;
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
    await authFetch("/api/typing", {
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
    const r = await authFetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "send",
        recipientUserId: selectedUser.userId,
        content,
        replyToId: replyingTo?.id,
      }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || "send failed");
    }
    await pollConversation();
    clearReply();
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

replyCancel.addEventListener("click", clearReply);

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
  dmAttachMenu.classList.toggle("open");
});

dmImageBtn.addEventListener("click", () => {
  dmImageInput.click();
  dmAttachMenu.classList.remove("open");
});

dmImageInput.addEventListener("change", async () => {
  const file = dmImageInput.files?.[0];
  dmImageInput.value = "";
  if (!file || !selectedUser) return;

  if (!file.type.startsWith("image/")) {
    showImageError("Apenas imagens são permitidas.");
    return;
  }

  try {
    const base64 = await downscaleImage(file);
    await uploadImageBase64(base64);
  } catch (e) {
    console.warn("[app] image upload pipeline:", e);
    showImageError(e.message || "Falha ao enviar imagem.");
  }
});

dmAudio.addEventListener("click", () => {
  if (!selectedUser) return;
  if (recordingIntent || audioRecording) {
    stopAudioRecording(true);
  } else {
    startAudioRecording();
  }
});
dmAudio.addEventListener("contextmenu", (e) => e.preventDefault());

// Open lightbox when any image inside a bubble is clicked.
dmMessages.addEventListener("click", (e) => {
  const img = e.target.closest(".dm-bubble img");
  if (!img) return;
  openLightbox(img.src);
});

// Close lightbox on backdrop click or close button.
dmLightbox.addEventListener("click", (e) => {
  if (e.target === dmLightbox || e.target.closest(".dm-lightbox-close")) {
    closeLightbox();
  }
});

// Search behavior
searchToggle.addEventListener("click", () => {
  const hidden = searchBox.hidden;
  searchBox.hidden = !hidden;
  if (!searchBox.hidden) searchInput.focus();
});

searchInput.addEventListener("input", () => {
  searchTerm = String(searchInput.value).trim().replace(/^@/, "");
  renderUsers(usersCache);
});

// Profile accordion
function renderProfileSummary() {
  if (!me) return;
  profileName.textContent = `@${me.username}`;
  profileHandle.textContent = `@${me.username}`;
  shownameInput.value = me.showname || "";
  setAvatarOrFallback(profileIcon, me.userId, me.hasAvatar, "avatar-img");
  setAvatarOrFallback(profileAvatar, me.userId, me.hasAvatar, "avatar-img avatar-img-large");
}

function toggleProfile() {
  profileExpanded = !profileExpanded;
  profileCard.classList.toggle("expanded", profileExpanded);
  profileBody.hidden = !profileExpanded;
  profileSummary.setAttribute("aria-expanded", String(profileExpanded));
  const chevron = profileSummary.querySelector(".profile-chevron i");
  if (chevron) {
    chevron.classList.toggle("bi-chevron-up", !profileExpanded);
    chevron.classList.toggle("bi-chevron-down", profileExpanded);
  }
}

function renderProfileBadge() {
  profileBadge.hidden = social.incoming.size === 0;
}

function renderIncomingRequests() {
  profileRequestsList.innerHTML = "";
  if (social.incoming.size === 0) {
    profileRequests.hidden = true;
    return;
  }
  profileRequests.hidden = false;

  for (const req of social.incoming.values()) {
    const row = document.createElement("div");
    row.className = "profile-request-row";

    const name = document.createElement("span");
    name.className = "profile-request-name";
    name.textContent = displayName({
      showname: req.senderShowname,
      username: req.senderUsername,
    });

    const actions = document.createElement("div");
    actions.className = "profile-request-actions";

    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.textContent = "Aceitar";
    acceptBtn.addEventListener("click", () => answerRequest(req.senderId, "accept"));

    const declineBtn = document.createElement("button");
    declineBtn.type = "button";
    declineBtn.textContent = "Recusar";
    declineBtn.addEventListener("click", () => answerRequest(req.senderId, "decline"));

    actions.appendChild(acceptBtn);
    actions.appendChild(declineBtn);
    row.appendChild(name);
    row.appendChild(actions);
    profileRequestsList.appendChild(row);
  }
}

function showProfileMessage(text, isError = true) {
  profileMessage.textContent = text;
  profileMessage.className = isError ? "profile-message error" : "profile-message success";
  setTimeout(() => {
    if (profileMessage.textContent === text) {
      profileMessage.textContent = "";
      profileMessage.className = "profile-message";
    }
  }, 3000);
}

profileSummary.addEventListener("click", toggleProfile);

profileIcon.addEventListener("click", (e) => {
  e.stopPropagation();
  openAvatarPicker();
});

profileAvatar.addEventListener("click", openAvatarPicker);

profileAvatarInput.addEventListener("change", async () => {
  const file = profileAvatarInput.files?.[0];
  profileAvatarInput.value = "";
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showProfileMessage("Apenas imagens são permitidas.");
    return;
  }

  try {
    const imageBase64 = await downscaleAvatar(file);
    const r = await authFetch("/api/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ imageBase64 }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      showProfileMessage(data.error || "Erro ao enviar foto");
      return;
    }
    avatarEpoch++;
    me.hasAvatar = true;
    renderProfileSummary();
    renderUsers(usersCache);
    if (selectedUser?.userId === me.userId) {
      setAvatarOrFallback(dmHeaderAvatar, me.userId, true, "avatar-img");
    }
    showProfileMessage("Foto atualizada", false);
  } catch (e) {
    console.warn("[app] avatar upload:", e);
    showProfileMessage("Erro ao enviar foto");
  }
});

shownameSave.addEventListener("click", async () => {
  const value = String(shownameInput.value).trim();
  try {
    const r = await authFetch("/api/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "setShowname", showname: value }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      showProfileMessage(data.error || "Erro ao salvar");
      return;
    }
    me.showname = data.showname || null;
    renderProfileSummary();
    showProfileMessage("Salvo", false);
  } catch (e) {
    console.warn("[app] save showname:", e);
    showProfileMessage("Erro ao salvar");
  }
});

function openLogoutConfirm() {
  logoutConfirmOverlay.hidden = false;
  logoutConfirm.hidden = false;
  logoutConfirmCancel.focus();
}

function closeLogoutConfirm() {
  logoutConfirmOverlay.hidden = true;
  logoutConfirm.hidden = true;
}

profileLogout.addEventListener("click", () => {
  openLogoutConfirm();
});

logoutConfirmCancel.addEventListener("click", closeLogoutConfirm);
logoutConfirmOverlay.addEventListener("click", closeLogoutConfirm);

logoutConfirmOk.addEventListener("click", async () => {
  closeLogoutConfirm();
  try {
    await authFetch("/api/logout", { method: "POST", credentials: "include" });
  } catch (e) {
    console.warn("[app] logout:", e);
  }
  location.href = "index.html";
});

// User bubble
function openBubble(user) {
  bubbleUser = user;
  userBubble.hidden = false;
  renderBubble();
}

function closeBubble() {
  bubbleUser = null;
  userBubble.hidden = true;
}

function renderBubble() {
  if (!bubbleUser) return;
  userBubbleName.textContent = displayName(bubbleUser);
  userBubbleHandle.textContent = `@${bubbleUser.username}`;
  userBubbleActions.innerHTML = "";

  const isFriend = social.friendIds.has(bubbleUser.userId);
  const incoming = social.incoming.has(bubbleUser.userId);
  const outgoing = social.outgoing.has(bubbleUser.userId);

  if (isFriend) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Enviar mensagem";
    btn.addEventListener("click", () => {
      const u = bubbleUser;
      selectUser(u);
    });
    userBubbleActions.appendChild(btn);
  } else if (incoming) {
    const accept = document.createElement("button");
    accept.type = "button";
    accept.textContent = "Aceitar";
    accept.addEventListener("click", async () => {
      const u = bubbleUser;
      const ok = await answerRequest(u.userId, "accept");
      if (ok) selectUser(u);
    });

    const decline = document.createElement("button");
    decline.type = "button";
    decline.textContent = "Recusar";
    decline.addEventListener("click", async () => {
      await answerRequest(bubbleUser.userId, "decline");
      closeBubble();
    });

    userBubbleActions.appendChild(accept);
    userBubbleActions.appendChild(decline);
  } else if (outgoing) {
    const label = document.createElement("button");
    label.type = "button";
    label.disabled = true;
    label.textContent = "Solicitação enviada";
    userBubbleActions.appendChild(label);
  } else {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Enviar solicitação";
    btn.addEventListener("click", async () => {
      try {
        const r = await authFetch("/api/friends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "send", targetUserId: bubbleUser.userId }),
        });
        if (!r.ok) throw new Error("send request failed");
        await fetchSocial();
        renderBubble();
      } catch (e) {
        console.warn("[app] send request:", e);
      }
    });
    userBubbleActions.appendChild(btn);
  }
}

userBubbleClose.addEventListener("click", closeBubble);

// Contact panel
function openContactPanel() {
  if (!selectedUser) return;
  closeBubble();
  closeDrawer();
  currentContact = selectedUser;
  contactPanelOpen = true;
  contactPanel.hidden = false;
  contactPanelOverlay.hidden = false;
  requestAnimationFrame(() => {
    contactPanel.classList.add("open");
  });
  populateContactPanel();
  setTimeout(() => contactPanelClose.focus(), 0);
}

function closeContactPanel() {
  contactPanel.classList.remove("open");
  contactPanelOpen = false;
  currentContact = null;
  setTimeout(() => {
    contactPanel.hidden = true;
    contactPanelOverlay.hidden = true;
  }, 260);
}

function populateContactPanel() {
  if (!selectedUser) return;
  contactName.textContent = displayName(selectedUser);
  contactHandle.textContent = `@${selectedUser.username}`;
  contactStatus.textContent = selectedUser.online ? "online" : "offline";
  contactStatus.className = `contact-panel-status ${selectedUser.online ? "online" : ""}`;
  setAvatarOrFallback(contactPanelAvatar, selectedUser.userId, selectedUser.hasAvatar, "");

  const targetId = selectedUser.userId;
  authFetch(`/api/contact?targetUserId=${encodeURIComponent(selectedUser.userId)}`, { credentials: "include" })
    .then(async (r) => {
      if (!r.ok) return;
      const data = await r.json();
      if (!currentContact || currentContact.userId !== targetId) return;
      contactName.textContent = data.showname || data.username || displayName(selectedUser);
      contactHandle.textContent = data.username ? `@${data.username}` : `@${selectedUser.username}`;
      if (data.online != null) {
        contactStatus.textContent = data.online ? "online" : "offline";
        contactStatus.className = `contact-panel-status ${data.online ? "online" : ""}`;
      }
      contactFriendsSince.textContent = data.friendsSince
        ? `Amigos desde ${new Date(data.friendsSince).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`
        : "";
      contactFirstConversation.textContent = data.firstConversationAt
        ? `Primeira conversa em ${new Date(data.firstConversationAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`
        : "";
    })
    .catch((e) => console.warn("[app] contact info:", e));
}

dmHeader.addEventListener("click", (e) => {
  if (e.target.closest("button")) return;
  e.stopPropagation();
  openContactPanel();
});

contactPanelClose.addEventListener("click", closeContactPanel);
contactPanelOverlay.addEventListener("click", closeContactPanel);

// Close bubble when clicking outside.
document.addEventListener("click", (e) => {
  if (!bubbleUser) return;
  if (userBubble.contains(e.target)) return;
  const row = e.target.closest(".user-row");
  if (row && row.dataset.userid === bubbleUser.userId) return;
  closeBubble();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  if (!logoutConfirm.hidden) {
    e.preventDefault();
    closeLogoutConfirm();
    return;
  }

  if (contactPanelOpen) {
    e.preventDefault();
    closeContactPanel();
    return;
  }

  if (bubbleUser) {
    e.preventDefault();
    closeBubble();
    return;
  }

  if (!dmLightbox.hidden) {
    e.preventDefault();
    closeLightbox();
    return;
  }

  if (replyingTo) {
    e.preventDefault();
    clearReply();
    return;
  }

  if (drawerOpen) {
    e.preventDefault();
    closeDrawer();
  }
});

// Focus the message list when the user clicks inside the DM panel but outside interactive controls.
dmPanel.addEventListener("click", (e) => {
  if (
    e.target.closest("#dm-input") ||
    e.target.closest("button") ||
    e.target.closest("input")
  ) {
    return;
  }
  dmMessages.focus({ preventScroll: true });
});

// Smooth line-by-line scrolling with Up/Down arrows when the message list has focus.
dmMessages.addEventListener("keydown", (e) => {
  if (e.target !== dmMessages) return;
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    const delta = e.key === "ArrowUp" ? -48 : 48;
    dmMessages.scrollBy({ top: delta, behavior: "smooth" });
  }
});

dmMessages.addEventListener(
  "scroll",
  () => {
    if (noMoreOlder || loadingOlder || messageList.length === 0) return;
    if (dmMessages.scrollTop <= LOAD_OLDER_THRESHOLD) {
      loadOlder();
    }
  },
  { passive: true }
);

async function heartbeat() {
  try {
    await authFetch("/api/presence", {
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

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && audioRecording) stopAudioRecording(false);
});

document.addEventListener("DOMContentLoaded", async () => {
  await initSession();
  if (!me) return;

  renderProfileSummary();
  await fetchSocial();
  if (window.innerWidth <= 768 && !selectedUser) {
    openDrawer();
  }
  heartbeat();
  setInterval(heartbeat, 60000);
  socialInterval = setInterval(fetchSocial, 5000);
  badgeInterval = setInterval(fetchIncomingBadge, 500);
});
