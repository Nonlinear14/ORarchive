# ORarchive 인계 문서

새 작업자가 이 프로젝트를 이어받기 위한 문서입니다. 작업 지침은 `CLAUDE.md`에, 기술 상세는 `README.md`에 있습니다.

## 1. 현재 상태
| 단계 | 내용 | 상태 |
|---|---|---|
| 0 | 프로젝트 뼈대, 디자인 토큰, GitHub Pages 배포 | ✅ 완료 |
| 1 | Google 로그인, 문서 자동 저장, 기기 간 동기화(오프라인·충돌·삭제 복구) | ✅ 완료, 사용자 테스트 통과 |
| 2 | 핸드아웃 스튜디오(템플릿 4종, 캔버스 직접 편집, 디자인 패널, Roll20 서식 복사, HTML 출력) | ✅ 완료, 배포됨. 사용자 확인은 아래 참고 |
| 3 | 로그 에디터 (사이드바: 로그 에디터 › Roll20 / 코코포리아) | Roll20 완료·배포(2026-11-26). 코코포리아 다음 |
| 4 | 캐릭터 시트 | 대기 |
| 5 | 공개 베타(보안 점검, 약관·개인정보 처리방침, 신고) | 대기. 이 단계가 끝나야 공개 |
| 6 | 확장(EPUB, 룰 팩, 이미지 업로드 등) | 대기 |

**2단계 사용자 확인 (2026-11-26)**
- ✅ **Roll20 실제 붙여넣기:** 디자인이 유지됨.
- ✅ **한글·영어 입력:** 캔버스 입력에 이상 없음.
- ✅ **두 기기 충돌 처리:** PC·휴대폰 모두 안내와 두 버튼 정상 (휴대폰은 하단 고정 안내로 수정 후 재확인, 2026-11-26).

**2단계 개선 후보 (검수에서 나온 비차단 항목)**
1. 상단 "동기화되지 않은 변경" 목록의 링크가 예전 `{text}` 형식 핸드아웃을 기본 편집기로 엽니다(`PendingIndicator.tsx`).
2. 삭제 복구 화면의 "내용 복사"가 저장된 원문이 아니라 Roll20용으로 정리한 텍스트를 복사합니다(`HandoutStudioPage.tsx`).
3. 한글을 조합하는 중에 빈 칸을 지우면 입력기 동작이 흔들릴 수 있습니다. 데이터 손실은 없습니다(`EditableField.tsx`).
4. `plaintext-only`를 지원하지 않는 브라우저에서는 서식 있는 내용을 끌어다 놓으면 화면에만 서식이 남습니다(`EditableField.tsx`).
5. 새 문서 대화상자가 템플릿 4종을 메인 번들에 포함시킵니다(`NewDocumentDialog.tsx`).
6. 이미지 주소 검사가 사설·루프백 IP도 허용합니다(`model.ts` `validateImageUrl`).

**핸드아웃 블록 편집 (2026-11-26 배포)**
- 템플릿은 바깥 틀(폭·테두리·여백)과 처음 블록만 정한다. 내용은 `layout.rows`(행마다 블록 1–2개). 블록: 글상자(`text`), 이미지(`image`, 주소 없고 `rule` 이 있으면 구분선). 배경색은 `style.background`.
- 기존 핸드아웃은 `layout.ts` 의 `deriveRows` 가 템플릿 + `fields` 에서 블록을 만들어 보여 준다(id: `f-칸` · `s-순번` · `r-순번` · `m-칸` · `img`). 처음 고칠 때 `layoutEdits.ts` 가 보이던 블록을 `layout.rows` 에 적고 `fields` 는 그대로 둔다.
- 화면: `canvas/BlockCanvas.tsx`(고르기 · 손잡이 끌기 · ↑↓ 키 · 2열, 구분선은 2열 불가), 패널 `studio/DesignPanel.tsx`(배경색 → 블록 추가 → 고른 블록 편집), 내보내기 `studio/ExportPanel.tsx`(롤꾸 복사 `blockRoll20.ts`, JPG `exportImage.ts`).
- 글꼴은 Pretendard(`src/lib/pretendard.ts`). Roll20 에서는 설치된 컴퓨터에서만 Pretendard. JPG 에는 CORS 를 허용하지 않는 다른 사이트 이미지는 빠진다(빠진 수를 알림).
- 되돌리기 · 다시 실행(`src/lib/useEditHistory.ts`, 이 화면을 연 동안 100단계): 디자인 설정 맨 위 버튼과 Ctrl+Z · Ctrl+Shift+Z · Ctrl+Y(글상자 입력 중에도, 제목·HEX 입력칸은 그 칸의 되돌리기). 같은 글상자에 이어서 입력한 글 · 같은 색 고르기는 1초 안에 이어지면 한 단계로 묶는다. 블록 삭제 확인 창은 없음(되돌리기로 복구).
- 2열 줄: `split`(왼쪽 너비 %, 20–80 정수, 없으면 50). 사이 손잡이를 끌어 조절, 손잡이에서 ← → 키는 좌우 바꾸기(`swapRow`). 두 블록은 같은 높이(더 높은 쪽) · 내용은 세로 가운데 · 위아래 여백은 줄에 한 번(`rowMargins`).
- 구분선 편집: 선 색 · 길이(px, 10–내용 칸 너비 `contentWidth`, 없으면 `widthPercent`) · 굵기(1–10px) · 스타일(실선 · 점선 · 1점 쇄선 · 2점 쇄선, `lineSegments` 로 조각을 만들어 화면은 span, 롤꾸 복사는 표 칸). 편집 화면에서만 구분선 블록의 위아래 12px 를 고르는 영역으로 넓힌다.
- 테두리(2026-11-26): 템플릿 테두리는 바깥 틀 한 겹만(달빛의 초대 · 비밀 결사의 인장의 안쪽 겹 삭제, 인장의 4px 이중선 → 2px 실선). 테두리 편집 옵션은 지원하지 않는다(사용자 결정).
- 색 고르기(`DesignPanel.tsx` ColorField): 로그 에디터처럼 동그라미 → 창(색 고르기 · 기본 색으로). 브라우저 색 창에서 끄는 동안(input)은 적용하지 않고 고른 색이 정해질 때(change) 한 번 적용. Chrome 은 Enter 와 창 바깥 클릭 모두 change 로 확정하고, Esc 는 취소. HEX 직접 입력도 있음.
- 초기화: 되돌리기 아래 버튼 → 확인 창 → `resetToTemplate`(템플릿 기본 content 로, 제목은 그대로). 되돌리기로 복구 가능.
- 이미지 편집은 주소만 (대체 텍스트 입력 없음, 저장된 alt 는 그대로 출력에 씀).
- 글상자 정렬(왼쪽 · 가운데 · 오른쪽). 이미지는 항상 블록 너비 100%, 높이는 원본 비율(템플릿의 maxWidth 는 쓰지 않음).

**사이드바·홈 개편 (2026-11-26 배포 완료)**
- 메뉴: 템플릿 아카이브(핸드아웃 `/templates`, Roll20 코드 `/templates/roll20`) · 템플릿 에디터(`/studio/handout`) · 로그 에디터(Roll20 `/studio/log/roll20`, 코코포리아 `/studio/log/ccfolia`) · 캐릭터 아카이브(`/characters`) · 설정(계정 설정, 화면 전환 토글). 상위 메뉴는 아이콘, 하위 메뉴는 아이콘 없이 들여쓰기. 1050px 이하로 접히면 상위 아이콘만 보이고 누르면 하위 메뉴 말풍선.
- 대시보드·내 프로젝트·내 보관함(`/library`)과 '새 문서' 창은 삭제했습니다. 1단계에서 만든 로그·캐릭터 문서는 로그 에디터·캐릭터 아카이브를 만들 때 그쪽 목록에 보여 줍니다(데이터는 그대로 있음).
- 템플릿 아카이브 › 핸드아웃: 내 핸드아웃(미리보기/목록 토글, 삭제, 새 핸드아웃 버튼). 핸드아웃을 고르면 미리보기 창이 뜨고, "이 템플릿 사용하기"는 사본(`useCopyHandout`, 저장 값 그대로 복사)을 만들어 열고, "원본 편집"은 원본을 엽니다. 템플릿 에디터 메뉴는 검색이 있는 템플릿 선택 창을 띄웁니다(2026-11-26 배포).
- 홈(`/`): 에디터 2분할 버튼 · 최근 연 템플릿 4개(핸드아웃+Roll20 코드) · 최근 연 캐릭터 4개 (2026-11-26 순서 변경).
- 브랜드(2026-11-26): 사이드바 'ORarchive / ORPG를 위한 툴 아카이브', 주사위 아이콘(Font Awesome Free `dice-d6`, SVG 를 `Brand.tsx` 에 직접 넣음, CC BY 4.0). 브라우저 탭 제목도 '· ORarchive'. 사이드바 아래 계정 칸은 삭제하고 '내 클라우드 공간' 칸이 그 자리. 서비스 이름은 ORarchive로 확정, 화면의 FOLIO 표기는 모두 바꿨다(내부 저장소 키 `folio-*`·`FolioClient` 는 유지). 최근 조회 기록은 기기별 localStorage(`src/lib/recentViews.ts`). 캐릭터·Roll20 코드 화면을 만들 때 `recordRecentView`를 호출해야 홈에 나옵니다.
- 다크 모드: `src/lib/theme.ts` + `src/styles/theme-dark.css`. 색은 개편 검토용 목업 페이지의 어두운 색 세트(배경 #0f181c, 카드 #172429, 글자 #e9e3d6). 새 화면에서 색을 직접 적었다면 다크 모드 덮어쓰기도 추가합니다.

## 2. 주요 주소와 계정
| 항목 | 주소 | 비고 |
|---|---|---|
| 사이트 | https://nonlinear14.github.io/ORarchive/ | `main`에 push하면 자동 배포 |
| 저장소 | https://github.com/Nonlinear14/ORarchive | 공개 저장소. 배포 계정은 Nonlinear14 |
| Supabase | https://supabase.com/dashboard/project/uankwfwwhdirrklqacqe | 로그인, DB(서울 리전) |
| Google OAuth | Google Cloud Console의 `folio` 프로젝트 | 앱 이름 ORarchive. **테스트 모드**라 테스트 사용자만 로그인 가능 |
| 목업 | `mockup/trpg_folio_mockup_v3.html` | 디자인 기준 |

**비밀 값은 이 문서와 저장소에 넣지 않습니다.** 대상은 Supabase service_role·secret 키, DB 비밀번호, Google Client Secret입니다. 이 값들이 필요하면 각 서비스의 팀 초대로 직접 접근하세요.

## 3. 넘겨주는 사람이 할 일
1. **GitHub:** 따로 할 일이 없습니다. 저장소 소유 계정(Nonlinear14)은 새 작업자 본인의 계정입니다.
2. **Supabase:** 새 작업자가 Supabase 프로젝트에 들어갈 수 있는지 확인합니다.
   - Supabase를 Nonlinear14의 GitHub 계정으로 가입했다면 새 작업자도 같은 방식으로 로그인할 수 있습니다.
   - 다른 계정으로 만들었다면 Organization 설정 → Team → **Invite**에서 새 작업자를 Developer 이상으로 초대합니다.
3. **Google Cloud:**
   - `folio` 프로젝트의 **Google 인증 플랫폼 → 대상 → 테스트 사용자**에 새 작업자의 Google 계정을 추가합니다.
   - OAuth 설정까지 맡길 경우 **IAM → 액세스 권한 부여**로 편집자 권한도 줍니다.
4. **이 문서와 `CLAUDE.md`가 포함된 커밋이 `main`에 push되었는지** 확인합니다.
5. 넘겨준 뒤에는 이 PC에서 Nonlinear14 로그인을 해제해도 됩니다(`gh auth logout`, Windows 자격 증명 관리자의 github.com 항목 삭제).

## 4. 받는 사람이 할 일 (새 PC)
1. **설치**
   - Git
   - Node.js 24 (22.22 이상)
   - Python 3: 브라우저 확인 스크립트를 쓸 때만 필요. `pip install playwright`
   - Google Chrome
2. **계정 준비**
   - GitHub는 본인 계정(Nonlinear14)으로 로그인합니다.
   - Supabase와 Google Cloud는 받은 초대를 수락하거나 기존 계정으로 로그인합니다.
3. **코드 받기와 실행**
   ```bash
   git clone https://github.com/Nonlinear14/ORarchive.git
   cd ORarchive
   cp .env.example .env
   npm install
   npm test -- --run
   npm run dev
   ```
   - `.env`에는 Supabase **Project URL**과 **publishable 키**를 넣습니다. Supabase 대시보드의 Project Settings → API Keys에서 확인할 수 있습니다.
   - 개발 서버 주소는 http://localhost:5173/ORarchive/ 입니다.
4. **Claude 데스크톱 앱에서 이어서 작업하기**
   1. Claude 데스크톱 앱의 **Code** 탭을 열고, 작업 폴더를 방금 받은 `ORarchive` 폴더로 지정합니다.
   2. 첫 메시지로 이렇게 입력합니다: **"`docs/HANDOFF.md`와 `CLAUDE.md`를 읽고 현재 상태를 요약한 뒤, 다음 작업을 제안해 주세요."**
   3. `CLAUDE.md`는 Claude가 자동으로 읽습니다. 이전 PC에서 쌓인 Claude 메모리는 옮겨지지 않지만, 필요한 결정 사항은 모두 `CLAUDE.md`와 이 문서에 담겨 있습니다.

## 5. 진행 중: 3단계 로그 에디터 (Roll20 먼저)
**샘플:** 사용자 PC의 `올카이브 제작` 폴더에 Roll20 채팅 아카이브 저장본 3개(`Chat Log for …html`)와 레퍼런스 1 스크린샷이 있습니다. 다른 사람의 대화가 들어 있으므로 저장소에 올리지 않습니다.

**샘플 분석 요약**
- 대화는 `#textchat > .content` 안의 `div.message`들. 종류: `general`, `general you`(저장한 사람), `desc`, `private whisper`, `rollresult`(/r), `hidden-message`, 이미지 메시지, 인라인 주사위(`inlinerollresult` + `fullcrit/fullfail`), 시트 롤템플릿(`sheet-rolltemplate-*`), 직접 꾸민 `<a style>`(롤꾸).
- 같은 사람이 이어 말하면 `spacer/avatar/tstamp/by`가 빠진다 → 앞 메시지의 화자를 이어받는다.
- 저장 파일 안의 `<style>` 하나에 캠페인 시트의 롤템플릿 CSS가 들어 있다 → 자동 추출해 미리보기·내보내기에 쓴다. 붙여넣기에는 없다.
- '웹페이지, 전체'로 저장하면 이미지 경로가 `./…_files/…`(PC 폴더)로 바뀐다 → 'HTML만' 저장 권장, 깨진 저널은 캐릭터 설정에서 주소 입력.
- 가장 큰 샘플(메시지 약 4,200개)의 대화 부분은 약 1.2MB.

**확정된 범위 (2026-11-26)**
- 로그 에디터 › Roll20 로그 편집: 내 로그 목록 + 오른쪽 위 '새 로그 불러오기'. 불러오기 창에서 HTML 파일 올리기 또는 채팅 아카이브 페이지 붙여넣기(Ctrl+A → Ctrl+C → Ctrl+V, 레퍼런스 4 방식).
- 편집 화면은 템플릿 에디터와 같은 틀: 가운데 Roll20 모양 로그(메시지 클릭 수정, 복제·이동·삭제·아래에 추가, 되돌리기), 오른쪽 설정(캐릭터·일괄 정리·찾아 바꾸기·표시·내보내기).
- 내보내기: 'HTML 파일 저장'과 '블로그용 코드 복사'를 각각 버튼으로.
- 원본은 서버에 저장하지 않는다(사용자 기기에 파일이 있음). 편집본만 저장.
- 시트 판정·주사위(인라인 판정 포함)는 내용 수정 불가(삭제·이동·숨기기만). 꾸민 글자(롤꾸: style 이 붙은 `<a>`·`<span>`)는 html 그대로 두고 글자만 고친다(`styledText.ts`, `setMessageHtml`). 수정 칸에서 인라인 판정·이미지는 contenteditable=false 로 잠그고, 찾아 바꾸기도 꾸민 글자의 글자 조각만 바꾼다.
- 저널: 원래 Roll20 주소가 있으면 사용, PC 경로면 캐릭터 설정에서 주소 입력 안내.
- 진행: 화면 목업 확인 → 구현 → 2026-11-26 배포. 목업: Claude 아티팩트 "Roll20 로그 에디터 화면 목업".

**구현 메모 (Roll20)**
- 코드: `src/features/log/roll20/` — `parse.ts`(읽기·DOMPurify 정리·룰 감지), `model.ts`(저장 형식·검사), `edits.ts`(고친 경로만 바꾸는 편집 연산), `render.ts`(Roll20 모양 HTML·채팅 CSS), `export.ts`(HTML 파일·블로그용 인라인 코드), `editor/`(편집 화면·미리보기·패널), `pages/`(목록·불러오기 창).
- 미리보기는 그림자 DOM 에 그린다 (불러온 시트 CSS 가 앱을 바꾸지 못하게). 화면 테스트는 `host.shadowRoot` 안을 찾는다.
- 목록의 룰은 `content->>rule` 만 조회한다 (`SUMMARY_COLUMNS`).
- 화면 문구에서 Roll20 의 avatar 는 **"저널"**이라고 부른다 (사용자 지시). 코드 이름은 avatar 그대로.
- 확장 프로그램 꾸밈(`extensionCss.ts`, content.extCss): 파일은 확장 프로그램 <style>(data-source 등)에서 메시지·판정 표 규칙만, 붙여넣기는 크롬이 넣은 style 속성을 메시지 종류별 규칙으로. 글꼴·Roll20 화면 규칙 제외. 토글 없음(감지되면 그대로 반영).
- CSS 순서(`logCss`): Roll20 기본 → 시트(title=charsheet) → 확장 꾸밈 → 표시 설정. 캐릭터 색은 !important.
- desc 서술은 characters['__desc__'] (배경·대사 색만). 이름이 GM 인 화자는 일반 캐릭터.
- 메시지는 그 자리에서 수정(contentEditable, `editor/inlineText.ts`), 수정 중 이름·저널 클릭으로 화자 바꾸기.
- 로그 속 이미지(저널 제외)를 누르면 이미지 바꾸기 창(`editor/ImageDialog.tsx`): 파일은 긴 쪽 800px 이하로 줄여 로그 안에 data URL 로 저장, 또는 https 링크. `setMessageImage` 는 그 이미지의 src 만 바꾼다.
- desc 서술 기울이기 토글(characters['__desc__'].italic=false). 끄는 규칙은 확장 꾸밈보다 앞에 두어 확장 프로그램 설정이 우선.
- 미리보기에만 Pretendard 웹폰트(`editor/viewerFonts.ts`). 내보내기에는 넣지 않는다. 글꼴 메뉴는 만들지 않기로 함.
- 실제 샘플 확인: `src/features/log/roll20/samples.local.test.ts`(저장소 제외, `*.local.test.ts`)를 만들어 `SAMPLE_DIR` 의 저장본을 읽어 볼 수 있다.

## 6. 참고 자료
- 데이터베이스 설정 절차: `supabase/README.md`
- 화면 기록: `docs/screens/`
- 기획 출처: ChatGPT 기획 대화와 claude.ai 목업 대화. 주요 내용은 `CLAUDE.md`의 "확정된 결정"에 정리되어 있습니다.
