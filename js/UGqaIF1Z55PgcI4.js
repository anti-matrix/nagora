const apiKey = localStorage.getItem("nagora_api_key");
if (!apiKey) {
  location.href = "index.html";
}

const userList = document.getElementById("user-list");
const dmPlaceholder = document.getElementById("dm-placeholder");
const dmPanel = document.getElementById("dm-panel");
const dmUsername = document.getElementById("dm-username");
const dmUserId = document.getElementById("dm-userid");

async function fetchUsers() {
  try {
    const r = await fetch("/api/users");
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
    row.addEventListener("click", () => selectUser(row, u));
    userList.appendChild(row);
  }
}

function selectUser(row, user) {
  for (const el of userList.querySelectorAll(".user-row")) {
    el.classList.remove("active");
  }
  row.classList.add("active");

  dmPlaceholder.hidden = true;
  dmPanel.hidden = false;
  dmUsername.textContent = user.username;
  dmUserId.textContent = user.userId || "—";
}

async function heartbeat() {
  try {
    await fetch("/api/presence", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    });
  } catch (e) {
    console.warn("[app] heartbeat:", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  fetchUsers();
  heartbeat();
  setInterval(heartbeat, 60000);
  setInterval(fetchUsers, 30000);
});
