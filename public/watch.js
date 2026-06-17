const root = document.querySelector("#watch");
const id = new URL(location.href).searchParams.get("id");

fetch("/api/videos")
  .then((response) => response.json())
  .then((videos) => {
    const video = videos.find((item) => item.id === id);
    if (!video) {
      root.innerHTML = `<div class="empty"><h1>영상을 찾을 수 없습니다.</h1><p>목록으로 돌아가 다시 선택해 주세요.</p></div>`;
      return;
    }

    const date = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date(video.createdAt));
    root.innerHTML = `
      <video class="player" controls playsinline poster="${video.thumbUrl}" src="${video.videoUrl}"></video>
      <div class="watch-info">
        <h1>${escapeHtml(video.title)}</h1>
        <p>${date}</p>
        ${video.description ? `<p class="description">${escapeHtml(video.description)}</p>` : ""}
        <div class="share-row">
          <input id="share-link" value="${location.href}" readonly>
          <button id="copy-link" type="button">링크 복사</button>
        </div>
      </div>
    `;

    document.querySelector("#copy-link").addEventListener("click", async () => {
      await navigator.clipboard.writeText(document.querySelector("#share-link").value);
      document.querySelector("#copy-link").textContent = "복사됨";
    });
  });

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}
