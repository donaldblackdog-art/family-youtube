const root = document.querySelector("#watch");
const id = new URL(location.href).searchParams.get("id");

Promise.all([
  fetch("/api/session").then((response) => response.json()),
  fetch("/api/videos").then((response) => response.json())
])
  .then(([session, videos]) => {
    const isAdmin = session.isAdmin;
    const video = videos.find((item) => item.id === id);
    if (!video) {
      root.innerHTML = `<div class="empty"><h1>영상을 찾을 수 없습니다.</h1><p>목록으로 돌아가 다시 선택해 주세요.</p></div>`;
      return;
    }

    const uploadedDate = formatDate(video.createdAt);
    const recordedDate = video.recordedDate ? formatDate(`${video.recordedDate}T00:00:00`) : "";
    root.innerHTML = `
      <video class="player" controls playsinline poster="${video.thumbUrl}" src="${video.videoUrl}"></video>
      <div class="watch-info">
        <h1>${escapeHtml(video.title)}</h1>
        <p>${recordedDate ? `촬영일 ${recordedDate}` : "촬영일 없음"} · 업로드일 ${uploadedDate}</p>
        ${video.description ? `<p class="description">${escapeHtml(video.description)}</p>` : ""}
        <div class="share-row">
          <input id="share-link" value="${location.href}" readonly>
          <button id="copy-link" type="button">링크 복사</button>
          ${isAdmin ? `<button id="edit-video" type="button">수정</button>` : ""}
          ${isAdmin ? `<button id="delete-video" class="delete-button" type="button">삭제</button>` : ""}
        </div>
        ${isAdmin ? `
          <form id="edit-form" class="edit-form" hidden>
            <div class="form-grid">
              <label>
                <span>제목</span>
                <input id="edit-title" name="title" type="text" value="${escapeAttribute(video.title)}" required>
              </label>
              <label>
                <span>촬영 날짜</span>
                <input id="edit-recorded-date" name="recordedDate" type="date" value="${escapeAttribute(video.recordedDate || "")}">
              </label>
            </div>
            <label>
              <span>메모</span>
              <textarea id="edit-description" name="description" rows="3">${escapeHtml(video.description || "")}</textarea>
            </label>
            <div class="form-actions">
              <button type="submit">저장</button>
              <button id="cancel-edit" class="secondary-button" type="button">취소</button>
            </div>
          </form>
        ` : ""}
      </div>
    `;

    document.querySelector("#copy-link").addEventListener("click", async () => {
      await navigator.clipboard.writeText(document.querySelector("#share-link").value);
      document.querySelector("#copy-link").textContent = "복사됨";
    });

    document.querySelector("#edit-video")?.addEventListener("click", () => {
      document.querySelector("#edit-form").hidden = false;
      document.querySelector("#edit-title").focus();
    });

    document.querySelector("#cancel-edit")?.addEventListener("click", () => {
      document.querySelector("#edit-form").hidden = true;
    });

    document.querySelector("#edit-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = event.currentTarget.querySelector("button[type='submit']");
      submitButton.textContent = "저장 중";
      submitButton.disabled = true;

      const response = await fetch(`/api/videos/${encodeURIComponent(video.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: document.querySelector("#edit-title").value,
          recordedDate: document.querySelector("#edit-recorded-date").value,
          description: document.querySelector("#edit-description").value
        })
      });

      if (!response.ok) {
        alert("수정하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        submitButton.textContent = "저장";
        submitButton.disabled = false;
        return;
      }

      location.reload();
    });

    document.querySelector("#delete-video")?.addEventListener("click", async () => {
      if (!confirm("이 영상을 삭제할까요? 영상 파일도 함께 삭제됩니다.")) return;

      const response = await fetch(`/api/videos/${encodeURIComponent(video.id)}`, { method: "DELETE" });
      if (!response.ok) {
        alert("삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      location.href = "/";
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

function escapeAttribute(value) {
  return escapeHtml(String(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date(value));
}
