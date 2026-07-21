# 초초TV

초초TV는 구글드라이브에 올린 가족 영상 링크를 모아서 보여주는 무료 정적 사이트입니다.

## 사이트 주소

GitHub Pages를 켜면 아래 형태의 주소로 볼 수 있습니다.

```text
https://donaldblackdog-art.github.io/family-youtube/
```

## 영상 추가 방식

1. 구글드라이브에 영상을 올립니다.
2. 공유 권한을 `링크가 있는 모든 사용자 - 뷰어`로 바꿉니다.
3. 공유 링크를 복사합니다.
4. `videos.js` 파일의 `window.CHOCHO_VIDEOS` 배열에 영상을 추가합니다.
5. GitHub에 푸시하면 사이트에 반영됩니다.

예시:

```js
window.CHOCHO_VIDEOS = [
  {
    title: "제주 가족여행",
    recordedDate: "2026-07-21",
    addedDate: "2026-07-21",
    description: "할머니, 할아버지와 함께 본 바다",
    driveUrl: "https://drive.google.com/file/d/구글드라이브파일ID/view"
  }
];
```

## 비밀번호

기본 가족 비밀번호는 `0000`입니다. 정적 사이트라서 강한 보안용 비밀번호는 아니고, 가족용 화면을 한 번 가리는 정도입니다.
