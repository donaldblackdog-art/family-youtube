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
4. `videos.private.json` 파일에 영상을 추가합니다.
5. 아래 명령으로 `videos.js`를 암호화해서 다시 만듭니다.
6. GitHub에 푸시하면 사이트에 반영됩니다.

```bash
node tools/encrypt-videos.mjs 0000
```

예시:

```json
[
  {
    title: "제주 가족여행",
    recordedDate: "2026-07-21",
    addedDate: "2026-07-21",
    description: "할머니, 할아버지와 함께 본 바다",
    driveUrl: "https://drive.google.com/file/d/구글드라이브파일ID/view"
  }
]
```

## 비밀번호

기본 가족 비밀번호는 `0000`입니다.

사이트는 비밀번호로 `videos.js` 안의 영상 목록을 복호화합니다. 그래서 공개 저장소에서도 구글드라이브 링크가 그대로 보이지 않습니다.

다만 완전한 은행급 보안은 아닙니다. 비밀번호를 아는 사람은 영상 목록을 볼 수 있으니 가족 밖으로 비밀번호를 공유하지 않는 방식으로 운영합니다.
