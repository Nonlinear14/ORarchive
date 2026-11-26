# FOLIO(ORarchive) 온보딩

TRPG(Roll20·코코포리아) 핸드아웃·세션 로그·캐릭터 시트를 만들고 보관하는 무료 웹 서비스입니다.

- 사이트: https://nonlinear14.github.io/ORarchive/
- 저장소: https://github.com/Nonlinear14/ORarchive

## 1. 계정 준비
- **GitHub:** 저장소는 Nonlinear14 계정 소유입니다. 그 계정으로 로그인하세요.
- **Supabase:** 로그인과 DB를 관리하는 곳입니다. 대시보드에서 `uankwfwwhdirrklqacqe` 프로젝트가 보이는지 확인하세요. 보이지 않으면 프로젝트 담당자에게 팀 초대를 요청하세요.
- **Google Cloud:** `folio` 프로젝트의 OAuth 테스트 사용자로 등록되어 있어야 사이트에 로그인할 수 있습니다. 등록되지 않았다면 담당자에게 요청하세요.

## 2. 설치
- Git
- Node.js 24 (22.22 이상)
- Google Chrome
- 선택: Python 3과 `pip install playwright`. 브라우저 확인 스크립트를 쓸 때만 필요합니다.

## 3. 코드 받고 실행하기
```bash
git clone https://github.com/Nonlinear14/ORarchive.git
cd ORarchive
cp .env.example .env
npm install
npm test -- --run
npm run dev
```
- `.env`에는 Supabase **Project URL**과 **publishable 키**만 넣습니다. Supabase 대시보드의 Project Settings → API Keys에서 확인할 수 있습니다.
- 개발 서버 주소는 http://localhost:5173/ORarchive/ 입니다.
- service_role 키, secret 키, DB 비밀번호, Google Client Secret은 저장소나 채팅에 절대 넣지 마세요.

## 4. Claude와 이어서 작업하기
1. Claude 데스크톱 앱의 **Code** 탭에서 `ORarchive` 폴더를 엽니다.
2. 첫 메시지로 이렇게 입력합니다: **"`docs/HANDOFF.md`와 `CLAUDE.md`를 읽고 현재 상태를 요약한 뒤, 다음 작업을 제안해 주세요."**

## 5. 꼭 알아 둘 것
- `main`에 push하면 GitHub Actions가 검사와 빌드를 거쳐 사이트에 자동 배포합니다.
- DB 스키마를 바꿀 때는 `supabase/migrations/`에 SQL 파일을 새로 추가하고, Supabase SQL Editor에서 실행합니다.
- 작업 원칙과 확정된 결정은 `CLAUDE.md`, 진행 상황과 다음 작업은 `docs/HANDOFF.md`, 기술 상세는 `README.md`에 있습니다.
