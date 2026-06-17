const grid = document.querySelector("#video-grid");
const count = document.querySelector("#count");
const videoFile = document.querySelector("#video-file");
const thumbnailData = document.querySelector("#thumbnail-data");
const thumbnailStatus = document.querySelector("#thumbnail-status");
const uploadForm = document.querySelector("#upload-form");

loadVideos();

videoFile?.addEventListener("change", async () => {
  const file = videoFile.files?.[0];
  thumbnailData.value = "";
  if (!file) {
    thumbnailStatus.textContent = "영상을 선택하면 썸네일을 자동으로 뽑습니다.";
    return;
  }

  thumbnailStatus.textContent = "썸네일을 뽑는 중입니다.";
  const thumbnail = await captureVideoThumbnail(file);
  if (thumbnail) {
    thumbnailData.value = thumbnail;
    thumbnailStatus.textContent = "영상에서 썸네일을 뽑았습니다.";
  } else {
    thumbnailStatus.textContent = "썸네일을 못 뽑으면 기본 이미지로 저장됩니다.";
  }
});

uploadForm?.addEventListener("submit", () => {
  const button = uploadForm.querySelector("button[type='submit']");
  button.textContent = "업로드 중";
  button.disabled = true;
});

function loadVideos() {
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
          <article class="video-card">
            <a href="/watch?id=${video.id}">
              <img src="${video.thumbUrl}" alt="">
            </a>
            <div>
              <a href="/watch?id=${video.id}">
                <h2>${escapeHtml(video.title)}</h2>
                <p>${date}</p>
              </a>
              <button class="delete-button" data-id="${video.id}" type="button">삭제</button>
            </div>
          </article>
        `;
      })
      .join("");

    grid.querySelectorAll(".delete-button").forEach((button) => {
      button.addEventListener("click", () => deleteVideo(button.dataset.id));
    });
  });
}

async function deleteVideo(id) {
  if (!confirm("이 영상을 삭제할까요? 영상 파일도 함께 삭제됩니다.")) return;

  const response = await fetch(`/api/videos/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    alert("삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    return;
  }

  loadVideos();
}

async function captureVideoThumbnail(file) {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
    await once(video, "loadedmetadata");
    video.currentTime = Math.min(2, Math.max(0, (video.duration || 1) * 0.2));
    await once(video, "seeked");

    const canvas = document.createElement("canvas");
    const width = 640;
    const ratio = video.videoHeight && video.videoWidth ? video.videoHeight / video.videoWidth : 9 / 16;
    canvas.width = width;
    canvas.height = Math.round(width * ratio);

    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return "";
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function once(target, eventName) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out")), 5000);
    target.addEventListener(eventName, () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
    target.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Video error"));
    }, { once: true });
  });
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
