# Kkomo Pages

GitHub Pages용 정적 프런트엔드입니다.

## 모드

- 공개 모드: 소개 / 사용법 / 플레이어 모드 안내
- 플레이어 모드: `one-time code`를 백엔드와 교환해서 프로필 / 뽑기 / 컬렉션 / 꾸미기 표시

## 예상 API

- `POST /api/web/session/exchange`
- `GET /api/web/me`
- `GET /api/web/collection`
- `POST /api/web/gacha/draw`
- `POST /api/web/profile/customize`
- `GET /api/web/rewards`

## 설정

- `apiBase`는 URL query `?apiBase=` 또는 localStorage `kkomo-pages:api-base`로 저장합니다.
- `code` query가 있으면 `session/exchange`를 먼저 시도합니다.

## 저장소

- localStorage는 UI 캐시와 마지막 탭만 저장합니다.
- 실제 보유 상태와 결과는 백엔드 응답을 기준으로 다시 읽습니다.

## 배포

- 이 문서는 GitHub Pages 정적 배포 스캐폴딩 기준입니다.
- GitHub Pages 배포는 저장소의 [.github/workflows/deploy-pages.yml](/Users/wonyoung_choi/projects/kakao-study-groupbot/.github/workflows/deploy-pages.yml) 에서 처리합니다.
- 현재는 `codex/kkomo-dev-baseline-20260326` 브랜치 push 와 `workflow_dispatch` 에서만 배포됩니다.
- 배포 대상은 `web/kkomo-pages/` 디렉터리 전체입니다.
- 브랜치가 dev 전용 명칭으로 바뀌면 workflow의 `push.branches`만 함께 수정하면 됩니다.
