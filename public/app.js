const grid = document.querySelector("#video-grid");
const count = document.querySelector("#count");
const driveForm = document.querySelector("#drive-form");
const driveStatus = document.querySelector("#drive-status");
const roleLabel = document.querySelector("#role-label");
const adminLink = document.querySelector("#admin-link");
const uploadButton = document.querySelector("#upload-button");
const sortSelect = document.querySelector("#sort-select");
let isAdmin = false;
let allVideos = [];

init();
setDefaultRecordedDate();

function setDefaultRecordedDate() {
  const input = driveForm?.querySelector("input[name='recordedDate']");
  if (!input || input.value) return;

  const today = new Date();
  const offsetToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);
  input.value = offsetToday.toISOString().slice(0, 10);
}

async function init() {
  const session = await fetch("/api/session").then((response) => response.json());
  isAdmin = session.isAdmin;
  roleLabel.textContent = isAdmin ? "관리자 모드" : "보기 전용";
  adminLink.style.display = isAdmin ? "none" : "inline";
  uploadButton.style.display = isAdmin ? "inline-block" : "none";
  loadVideos();
}

driveForm?.addEventListener("submit", () => {
  const button = driveForm.querySelector("button[type='submit']");
  button.textContent = "등록 중";
  button.disabled = true;
  driveStatus.textContent = "구글드라이브 링크를 등록하고 있습니다.";
});

sortSelect?.addEventListener("change", renderVideos);

function loadVideos() {
  fetch("/api/videos")
  .then((response) => response.json())
  .then((videos) => {
    allVideos = videos;
    showDriveError();
    renderVideos();
  });
}

function renderVideos() {
    const videos = sortVideos(allVideos, sortSelect?.value || "uploaded");
    count.textContent = `${videos.length}개 영상`;
    if (videos.length === 0) {
      grid.innerHTML = `
        <div class="empty">
          <h2>아직 영상이 없습니다.</h2>
          <p>오른쪽 위의 Drive 링크 등록을 눌러 첫 가족 영상을 추가해 보세요.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = videos
      .map((video) => {
        const uploadedDate = formatDate(video.createdAt);
        const recordedDate = video.recordedDate ? formatDate(`${video.recordedDate}T00:00:00`) : "";
        return `
          <article class="video-card">
            <a href="/watch?id=${video.id}">
              <img src="${video.thumbUrl}" alt="" onerror="this.src='/public/placeholder.svg'">
            </a>
            <div>
              <a href="/watch?id=${video.id}">
                <h2>${escapeHtml(video.title)}</h2>
                <p class="video-meta">${recordedDate ? `촬영 ${recordedDate}` : `등록 ${uploadedDate}`}</p>
              </a>
              ${isAdmin ? `<button class="delete-button" data-id="${video.id}" type="button">삭제</button>` : ""}
            </div>
          </article>
        `;
      })
      .join("");

    grid.querySelectorAll(".delete-button").forEach((button) => {
      button.addEventListener("click", () => deleteVideo(button.dataset.id));
    });
}

function sortVideos(videos, sortMode) {
  return [...videos].sort((a, b) => {
    if (sortMode === "recorded") {
      const recordedDiff = dateValue(b.recordedDate) - dateValue(a.recordedDate);
      if (recordedDiff !== 0) return recordedDiff;
    }

    return dateValue(b.createdAt) - dateValue(a.createdAt);
  });
}

function dateValue(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value));
}

async function deleteVideo(id) {
  if (!isAdmin) return;
  if (!confirm("초초TV 목록에서 이 영상을 삭제할까요? 구글드라이브 원본은 삭제되지 않습니다.")) return;

  const response = await fetch(`/api/videos/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    alert("삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    return;
  }

  loadVideos();
}

function showDriveError() {
  const params = new URLSearchParams(location.search);
  if (params.get("driveError") !== "1" || !driveStatus) return;
  document.querySelector("#upload-toggle").checked = true;
  driveStatus.textContent = "구글드라이브 공유 링크를 확인하지 못했습니다. /file/d/가 들어간 링크를 붙여넣어 주세요.";
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}
