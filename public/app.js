const grid = document.querySelector("#video-grid");
const count = document.querySelector("#count");

fetch("/api/videos")
  .then((response) => response.json())
  .then((videos) => {
    count.textContent = `${videos.length}개 영상`;
    if (videos.length === 0) {
      grid.innerHTML = `
        <div class="empty">
          <h2>아직 영상이 없습니다.</h2>
          <p>오른쪽 위의 영상 올리기를 눌러 첫 가족 영상을 추가해 보세요.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = videos
      .map((video) => {
        const date = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(video.createdAt));
        return `
          <a class="video-card" href="/watch?id=${video.id}">
            <img src="${video.thumbUrl}" alt="">
            <div>
              <h2>${escapeHtml(video.title)}</h2>
              <p>${date}</p>
            </div>
          </a>
        `;
      })
      .join("");
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
