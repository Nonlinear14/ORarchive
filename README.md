# FOLIO

TRPG(Roll20·코코포리아) 기록 보관·창작 워크스페이스. 핸드아웃 스튜디오(캔버스 직접 편집 + Roll20 서식 복사), 로그 스튜디오(가져오기·편집·내보내기), 캐릭터 시트, 프로젝트·보관함을 Google 로그인과 기기 간 동기화로 제공하는 무료 공개 서비스를 목표로 합니다.

현재는 **Phase 0 — 앱 골격** 단계입니다. 앱 셸(사이드바·상단바·모바일 내비)과 각 화면의 자리표시 페이지만 있습니다. 디자인 기준은 `mockup/trpg_folio_mockup_v3.html` 입니다.

## 기술 스택

Vite · React · TypeScript(strict) · React Router · 일반 CSS(디자인 토큰) · Supabase(`@supabase/supabase-js`, PKCE) · Vitest + Testing Library · ESLint

## 로컬 개발

Node 22.22 이상이 필요합니다(`.nvmrc` = 24).

```bash
npm install
cp .env.example .env   # 값 채우기
npm run dev            # http://localhost:5173/ORarchive/
```

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run typecheck` | `tsc` 타입 검사 |
| `npm run lint` | ESLint |
| `npm test -- --run` | Vitest 1회 실행 (`npm test` 는 watch 모드) |
| `npm run build` | 프로덕션 빌드 + `dist/404.html`, `dist/.nojekyll` 생성 |
| `npm run preview` | 빌드 결과 미리보기 (http://localhost:4173/ORarchive/) |

## 환경 변수

| 이름 | 설명 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable 키 (공개용 키) |

빌드 시점에 번들에 포함되므로 공개되어도 되는 값만 넣습니다. 값이 없으면 앱은 그대로 뜨고 로그인 기능만 비활성화됩니다.

## 배포 (GitHub Pages)

`main` 에 push 하면 `.github/workflows/deploy.yml` 이 타입 검사·린트·테스트·빌드 후 https://nonlinear14.github.io/ORarchive/ 로 배포합니다.

저장소 설정에서 한 번만 해 두세요.

1. **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 설정
2. **Settings → Secrets and variables → Actions → Variables** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` 추가

Vite `base` 는 `/ORarchive/` 입니다. 저장소 이름이 바뀌면 `vite.config.ts` 의 `base` 도 함께 바꿔야 합니다. SPA 딥링크(예: `/ORarchive/settings` 새로고침)는 `404.html` 이 `index.html` 복사본이라 동작합니다.
