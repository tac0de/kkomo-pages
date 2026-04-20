# Kkomo Pages

꼬모 프로필 열람판용 GitHub Pages 프론트엔드입니다.

## 기술 스택

- `Vite`
- `React`
- `TypeScript`

## 랜딩 모드

- `intro`: 유효한 유저 프로필 링크가 없을 때 보이는 소개 모드
- `loading`: 공개 snapshot을 읽는 중인 상태
- `profile`: 유효한 snapshot이 있을 때 보이는 개인 프로필 열람판
- `invalid-link`: 링크가 열렸지만 실제로 열람 가능한 기록을 불러오지 못한 상태

## 공개 API

- `GET /api/public/landing-snapshot`

query:
- `userId`
- `conversationKey`
- `apiBase`

## 개발

```bash
npm install
npm run dev
```

기본 API base는 앱 코드 안의 dev Cloud Run URL을 사용합니다.

## 배포

- GitHub Pages 배포는 [.github/workflows/deploy-pages.yml](./.github/workflows/deploy-pages.yml) 에서 처리합니다.
- `main` push 와 `workflow_dispatch` 에서만 배포됩니다.
- 배포 대상은 `npm run build` 결과물인 `dist/`입니다.
