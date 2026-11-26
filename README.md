# FOLIO

TRPG(Roll20·코코포리아) 기록 보관·창작 워크스페이스. 핸드아웃 스튜디오(캔버스 직접 편집 + Roll20 서식 복사), 로그 스튜디오(가져오기·편집·내보내기), 캐릭터 시트, 프로젝트·보관함을 Google 로그인과 기기 간 동기화로 제공하는 무료 공개 서비스를 목표로 합니다.

현재는 **Phase 2 — 핸드아웃 스튜디오(MVP)** 단계입니다. Phase 1 의 Google 로그인 · 내 보관함 · 자동 저장/기기 간 동기화 위에 다음이 동작합니다.

- **템플릿 갤러리** (`/templates`): 4개 기본 템플릿(달빛의 초대 · 오래된 조사 기록 · 비밀 결사의 인장 · 숲의 기록), 분류 필터, 실제 캔버스 미리보기. "이 템플릿으로 시작"으로 핸드아웃 문서를 만들어 스튜디오를 엽니다.
- **핸드아웃 스튜디오** (`/studio/handout/:id`, 목록 `/studio/handout`): 캔버스 글자 직접 편집, 템플릿 바꾸기(공통 칸 유지), 테마 · 강조 색 · 글꼴 · https 이미지 주소. 편집은 Phase 1 동기화 계층(`useDocument`)으로 저장되며 충돌 · 오프라인 · 삭제 복구 화면도 그대로 씁니다.
- **Roll20에 복사**: 표 기반 · 인라인 스타일만 쓰는 HTML(text/html + text/plain)을 클립보드에 넣어 Roll20 핸드아웃 내용 칸에 Ctrl+V 로 붙여 넣습니다. HTML 코드 보기 · HTML 파일 저장도 있습니다.
- 로그 · 캐릭터 문서는 다음 단계까지 기본 편집기(`/documents/:id`)를 씁니다.

핸드아웃 content 형식과 템플릿 정의는 `src/features/handout/` (`model.ts`, `edits.ts`, `templates/`, `roll20.ts`) 를 보세요. 저장된 content 는 편집할 때 고친 경로만 바뀌고(`edits.ts`), 화면 · Roll20 출력은 그것을 검사 · 정규화한 보기(`resolveHandout`)만 씁니다. 디자인 기준은 `mockup/trpg_folio_mockup_v3.html` 입니다.

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
| `python scripts/check_phase2.py` | (preview 실행 중) 가짜 세션으로 갤러리 → 스튜디오 → Roll20 복사를 브라우저에서 확인, `docs/screens/phase2-*.png` 저장. Python Playwright 필요 |

## 환경 변수

| 이름 | 설명 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable 키 (공개용 키) |

빌드 시점에 번들에 포함되므로 공개되어도 되는 값만 넣습니다. 값이 없으면 앱은 그대로 뜨고 로그인 기능만 비활성화됩니다.

## 데이터베이스 (Supabase)

스키마는 `supabase/migrations/*.sql` 에 있고, Supabase SQL Editor 에 붙여 넣어 실행합니다. 절차와 확인 방법은 [`supabase/README.md`](supabase/README.md) 를 보세요.

- 모든 테이블은 RLS 로 **본인 행만** 읽고 쓸 수 있습니다.
- 문서 저장은 `version` 조건부 UPDATE(낙관적 동시성)로, 다른 기기와 충돌하면 덮어쓰지 않고 사용자에게 선택을 묻습니다.
- 오프라인에서 편집한 내용은 IndexedDB(`folio-sync`)에 **사용자/문서/편집 인스턴스(탭)별로** 보관했다가 다시 연결되면 보냅니다. 한 탭의 저장이 다른 탭의 대기 변경을 지우지 않으며, 정리는 기록한 revision 이 그대로일 때만 합니다.
- 충돌한 변경은 원래 기준 version 과 충돌 표시를 그대로 보관해, 새로고침해도 사용자가 고르기 전까지 서버에 쓰지 않습니다.
- 로그인한 동안 앱 전역 백그라운드 동기화가 닫힌 탭이 남긴 변경까지 보내고(기준 version 이 서버와 같을 때만), 충돌은 상단바의 "동기화되지 않은 변경 N개"에 모아 보여 줍니다. 열린 편집기와는 Web Locks 로 조율해 중복 전송하지 않습니다.
- 마지막으로 불러온 문서는 IndexedDB(`folio-cache`)에 사본을 두어, 오프라인에서도 다시 열어 편집할 수 있습니다.

## 배포 (GitHub Pages)

`main` 에 push 하면 `.github/workflows/deploy.yml` 이 타입 검사·린트·테스트·빌드 후 https://nonlinear14.github.io/ORarchive/ 로 배포합니다.

저장소 설정에서 한 번만 해 두세요.

1. **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 설정
2. **Settings → Secrets and variables → Actions → Variables** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` 추가

Vite `base` 는 `/ORarchive/` 입니다. 저장소 이름이 바뀌면 `vite.config.ts` 의 `base` 도 함께 바꿔야 합니다. SPA 딥링크(예: `/ORarchive/settings` 새로고침)는 `404.html` 이 `index.html` 복사본이라 동작합니다.
