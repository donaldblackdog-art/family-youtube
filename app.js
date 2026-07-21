const SESSION_KEY = "chocho-tv-unlocked";
let videos = [];

const loginScreen = document.querySelector("#login-screen");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const passwordInput = document.querySelector("#password-input");
const app = document.querySelector("#app");
const grid = document.querySelector("#video-grid");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const totalCount = document.querySelector("#total-count");
const logoutButton = document.querySelector("#logout-button");
const dialog = document.querySelector("#player-dialog");
const playerFrame = document.querySelector("#player-frame");
const playerTitle = document.querySelector("#player-title");
const playerMeta = document.querySelector("#player-meta");
const playerDescription = document.querySelector("#player-description");
const closePlayer = document.querySelector("#close-player");

init();

async function init() {
  if (sessionStorage.getItem(SESSION_KEY)) {
    await unlock(sessionStorage.getItem(SESSION_KEY));
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await unlock(passwordInput.value);
  });

  searchInput.addEventListener("input", renderVideos);
  sortSelect.addEventListener("change", renderVideos);
  logoutButton.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });
  closePlayer.addEventListener("click", closeDialog);
  dialog.addEventListener("close", () => {
    playerFrame.src = "about:blank";
  });
}

async function unlock(password) {
  try {
    const decryptedVideos = await decryptVideos(password);
    videos = normalizeVideos(decryptedVideos);
    sessionStorage.setItem(SESSION_KEY, password);
    loginError.hidden = true;
    showApp();
  } catch (error) {
    console.error(error);
    sessionStorage.removeItem(SESSION_KEY);
    loginError.hidden = false;
    passwordInput.select();
  }
}

function showApp() {
  loginScreen.hidden = true;
  app.hidden = false;
  totalCount.textContent = String(videos.length);
  renderVideos();
}

function renderVideos() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = sortVideos(videos, sortSelect.value).filter((video) => {
    const haystack = [video.title, video.description, video.recordedDate].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty">
        <h2>${videos.length === 0 ? "아직 등록된 영상이 없습니다." : "검색 결과가 없습니다."}</h2>
        <p>${videos.length === 0 ? "구글드라이브 영상 링크를 videos.js에 추가하면 여기에 나타납니다." : "검색어를 조금 바꿔보세요."}</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map((video) => `
    <article class="video-card">
      <button class="thumb-button" type="button" data-id="${escapeHtml(video.id)}">
        <img src="${escapeAttribute(video.thumbUrl)}" alt="" onerror="this.src='https://placehold.co/640x360/f1eadf/227864?text=ChochoTV'">
        <span>재생</span>
      </button>
      <div>
        <h2>${escapeHtml(video.title)}</h2>
        <p class="video-meta">${video.recordedDate ? `촬영 ${formatDate(video.recordedDate)}` : `등록 ${formatDate(video.addedDate)}`}</p>
        ${video.description ? `<p class="card-description">${escapeHtml(video.description)}</p>` : ""}
      </div>
    </article>
  `).join("");

  grid.querySelectorAll(".thumb-button").forEach((button) => {
    button.addEventListener("click", () => openVideo(button.dataset.id));
  });
}

function openVideo(id) {
  const video = videos.find((item) => item.id === id);
  if (!video) return;

  playerTitle.textContent = video.title;
  playerMeta.textContent = `${video.recordedDate ? `촬영일 ${formatDate(video.recordedDate)}` : "촬영일 없음"} · 등록일 ${formatDate(video.addedDate)}`;
  playerDescription.textContent = video.description || "";
  playerFrame.src = video.previewUrl;
  dialog.showModal();
}

function closeDialog() {
  dialog.close();
}

function normalizeVideos(items) {
  return items.map((item, index) => {
    const driveId = extractDriveId(item.driveUrl || item.driveId || "");
    return {
      id: driveId || `video-${index}`,
      title: String(item.title || "제목 없는 영상").trim(),
      description: String(item.description || "").trim(),
      recordedDate: normalizeDate(item.recordedDate),
      addedDate: normalizeDate(item.addedDate) || today(),
      driveId,
      previewUrl: driveId ? `https://drive.google.com/file/d/${driveId}/preview` : "",
      thumbUrl: driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w640` : ""
    };
  }).filter((item) => item.driveId);
}

async function decryptVideos(password) {
  const encrypted = window.CHOCHO_ENCRYPTED_VIDEOS;
  if (!encrypted?.salt || !encrypted?.iv || !encrypted?.data) {
    throw new Error("Missing encrypted video list");
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(encrypted.salt),
      iterations: encrypted.iterations || 210000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(encrypted.iv)
    },
    key,
    base64ToBytes(encrypted.data)
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function sortVideos(items, mode) {
  return [...items].sort((a, b) => {
    if (mode === "title") return a.title.localeCompare(b.title, "ko");
    if (mode === "added") return dateValue(b.addedDate) - dateValue(a.addedDate);
    return dateValue(b.recordedDate || b.addedDate) - dateValue(a.recordedDate || a.addedDate);
  });
}

function extractDriveId(value) {
  if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) return value;

  try {
    const url = new URL(value);
    const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (pathMatch) return pathMatch[1];
    return url.searchParams.get("id") || "";
  } catch {
    return "";
  }
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  return text;
}

function dateValue(value) {
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

function today() {
  const now = new Date();
  const offset = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return offset.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
