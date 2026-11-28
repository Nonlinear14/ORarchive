# ORarchive 인계 문서

새 작업자가 이 프로젝트를 이어받기 위한 문서입니다. 작업 지침은 `CLAUDE.md`에, 기술 상세는 `README.md`에 있습니다.

## 1. 현재 상태
| 단계 | 내용 | 상태 |
|---|---|---|
| 0 | 프로젝트 뼈대, 디자인 토큰, GitHub Pages 배포 | ✅ 완료 |
| 1 | Google 로그인, 문서 자동 저장, 기기 간 동기화(오프라인·충돌·삭제 복구) | ✅ 완료, 사용자 테스트 통과 |
| 2 | 핸드아웃 스튜디오(블록 편집, 디자인 패널, 롤꾸 복사, JPG 저장) | ✅ 완료, 배포됨. 사용자 확인은 아래 참고 |
| 3 | 로그 에디터 (사이드바: 로그 아카이브 › 로그 목록 / Roll20 로그 편집 / 코코포리아 로그 편집) | Roll20 완료·배포(2026-11-26). 코코포리아 다음 |
| 4 | 캐릭터 시트 | 대기 |
| 5 | 공개 베타(보안 점검, 약관·개인정보 처리방침, 신고) | 대기. 이 단계가 끝나야 공개. **보안 점검 할 일은 아래 목록** |
| 6 | 확장(EPUB, 룰 팩, 이미지 업로드 등) | 대기 |

**2단계 사용자 확인 (2026-11-26)**
- ✅ **Roll20 실제 붙여넣기:** 디자인이 유지됨.
- ✅ **Roll20 '웹페이지, 전체' 저장 + 원래 주소 되살리기 (2026-11-27):** Roll20 채팅 아카이브는 메시지를 `msgdata = "<base64 JSON>"` 로 싣고 스크립트로 그린다. 'HTML만' 저장은 그려지기 전 원본이라 `div.message` 가 없어 불러올 수 없다(전용 오류 문구). 안내를 '웹페이지, 전체'로 바꾸고, `parse.ts` 의 `readArchiveImages` 가 msgdata 에서 메시지 번호별 원래 저널(`avatar`)과 본문 이미지(<img>, [글](주소), 맨 이미지 주소)를 찾아 PC 폴더 경로를 나온 차례대로 바꾼다. 실제 샘플: 저널 PC 경로 0개, 본문 이미지 11개 모두 되살림.
- ✅ **캔버스 폭 450px (2026-11-27):** 템플릿 4종 `width` 430→450. 폭은 핸드아웃에 저장되지 않고 템플릿에서 오므로 기존 핸드아웃도 함께 넓어진다(저장 값 변화 없음). 편집 화면 `.canvas-stage .hc-canvas` max-width, 목록 미리보기 `.template-preview-scale` 폭도 450.
- ✅ **휴대폰 로그 미리보기 스크롤 (2026-11-27):** 750px 이하에서 `.log-stage` 를 `max(320px, 68dvh)` 로 묶어 상자 안에서만 스크롤(PC는 원래 같은 방식). 캐릭터 바꾸기 목록(`SpeakerMenu`)은 아래로 열면 상자 밖으로 잘릴 때 위로 열고(`useOpenUpward`, 그림자 DOM의 host 기준), 양쪽 다 모자라면 넓은 쪽 높이에 맞춰 줄인다.
- ✅ **이름 직접 고치기 · 캐릭터 목록 스크롤 (2026-11-27):** `LogPreview.tsx` 의 `NameEditor`(이름 더블 클릭)와 `SpeakerMenu` 의 이름 직접 입력 칸(휴대폰). `resolveTypedSpeaker`(model.ts)가 대소문자·앞뒤 공백을 무시해 기존 캐릭터 이름으로 맞추고, 없으면 새 이름 그대로 `setMessageSpeaker`. 글자 칸 blur 는 포커스가 이름 칸·캐릭터 목록으로 갈 때 수정을 끝내지 않는다. 패널 `.char-list` 는 1050px 초과에서 max-height 자체 스크롤.
- ✅ **목록 칩 · 귓속말 항목 · 원래 색 (2026-11-27):** `DocumentList` 의 `kindColumn`(컬러칩, `lib/kindChips.ts`)·`showVisibility`. 로그 플랫폼은 목록 조회의 `format:content->>format`(ccfolia 로 시작하면 코코포리아). 로그 편집: `detectColors.ts` 가 미리보기(그림자 DOM)의 계산된 색을 읽어 색 동그라미에 보여 줌(사용자가 고른 칸은 세지 않음, 저장 안 함). 귓속말 묶음 = `kind==='whisper'` 또는 판정 중 `private`/(To·From) 머리(`isWhisperGroup`), 설정 열쇠 `__whisper__`, `effectiveSetting` 으로 캐릭터 설정보다 우선. 예전 `options.hideWhispers` 는 읽기만 하고 귓속말 항목에서 끌 때 함께 끈다.
- ✅ **기본 핸드아웃 (2026-11-27):** 운영 계정의 "핸드아웃 샘플" content 를 `src/features/handout/templates/sample.ts` 에 그대로 옮겼다. `useSeedSampleHandout` 가 아카이브·템플릿 선택창에서 목록이 비었을 때 `repo.hasEver('handout')`(지운 문서 포함)로 확인해 한 번도 없던 계정에만 만든다(같은 기기 여러 탭은 Web Locks 로 막음). 빈 선택창의 예전 4종은 샘플로 대체. 샘플을 고치려면 운영 계정에서 고친 뒤 content 를 다시 옮긴다.
- ✅ **Roll20 아웃라인 (2026-11-27):** 블록 편집 뒤 붙여넣기에서 틀·공백·2열 표에 회색 테두리와 여분 여백이 보였다(Roll20 이 표 칸에 스타일을 입힘). 틀·공백은 `<div>`, 남은 표는 테두리·여백을 `!important` 로 지우도록 `blockRoll20.ts` 수정. 사용자 Roll20 확인 완료.
- ✅ **한글·영어 입력:** 캔버스 입력에 이상 없음.
- ✅ **두 기기 충돌 처리:** PC·휴대폰 모두 안내와 두 버튼 정상 (휴대폰은 하단 고정 안내로 수정 후 재확인, 2026-11-26).

**5단계 보안 점검 때 할 일 (사용자 요청: 남은 할 일을 정리해 달라고 할 때만 요약해서 함께 보여 줄 것)**
- [ ] 이미지 주소 검사(`model.ts` `validateImageUrl`)가 내부망·자기 컴퓨터 주소(`https://192.168.…`, `https://127.0.0.1/…`, `localhost` 류)를 통과시킨다. 핸드아웃을 받은 사람의 브라우저가 자기 내부망으로 요청을 보내게 될 수 있으므로 IP 주소·사설 대역·`.local` 등을 막는다. 블록 이미지(`layout.ts`)와 로그 저널 주소(`isWebUrl`)도 함께 본다.

**2단계 개선 후보 정리 (2026-11-27)**
1. ✅ 해결(2026-11-28): 문서 주소는 `DocumentPage` 의 `useEditorRoute` 가 문서를 열기 전에 종류만 읽어(대기 기록 → 사본 → 서버) 맞는 편집기로 넘긴다. 예전 `{ text }` 핸드아웃은 스튜디오가 안내 + "업데이트"(`layoutEdits.upgradeLegacy`)로 바꾸기 전까지 편집을 막는다. 상단 목록 항목에 `docType` 을 실어 핸드아웃 · 롤꾸코드는 바로 그 편집기로.
2. 삭제된 핸드아웃 복구 화면은 "새 문서로 복구"만(`DeletedRecovery` 의 `restoreOnly`). "내용 복사"는 글자만 복사돼 빼고, "변경 버리기/사본 지우기"는 이 기기의 사본을 정리하는 유일한 방법이라 남김.
3·4. 예전 칸 편집기 `EditableField.tsx` 삭제. 새 글상자 편집기(`RichField.tsx`)는 붙여넣기와 마찬가지로 바깥에서 끌어다 놓은 글도 평문으로 넣는다(칸 안에서 옮기기는 브라우저에 맡김).
5. 해결(예전 '새 문서' 창 삭제).
6. 위 '5단계 보안 점검 때 할 일'로 옮김.

**핸드아웃 블록 편집 (2026-11-26 배포)**
- 템플릿은 바깥 틀(폭·테두리·여백)과 처음 블록만 정한다. 내용은 `layout.rows`(행마다 블록 1–2개). 블록: 글상자(`text`), 이미지(`image`, 주소 없고 `rule` 이 있으면 구분선). 배경색은 `style.background`.
- 기존 핸드아웃은 `layout.ts` 의 `deriveRows` 가 템플릿 + `fields` 에서 블록을 만들어 보여 준다(id: `f-칸` · `s-순번` · `r-순번` · `m-칸` · `img`). 처음 고칠 때 `layoutEdits.ts` 가 보이던 블록을 `layout.rows` 에 적고 `fields` 는 그대로 둔다.
- 화면: `canvas/BlockCanvas.tsx`(고르기 · 손잡이 끌기 · ↑↓ 키 · 2열, 구분선은 2열 불가), 패널 `studio/DesignPanel.tsx`(배경색 → 블록 추가 → 고른 블록 편집), 내보내기 `studio/ExportPanel.tsx`(롤꾸 복사 `blockRoll20.ts`, JPG `exportImage.ts`).
- 글꼴은 Pretendard(`src/lib/pretendard.ts`). Roll20 에서는 설치된 컴퓨터에서만 Pretendard. JPG 에는 CORS 를 허용하지 않는 다른 사이트 이미지는 빠진다(빠진 수를 알림).
- 되돌리기 · 다시 실행(`src/lib/useEditHistory.ts`, 이 화면을 연 동안 100단계): 디자인 설정 맨 위 버튼과 Ctrl+Z · Ctrl+Shift+Z · Ctrl+Y(글상자 입력 중에도, 제목·HEX 입력칸은 그 칸의 되돌리기). 같은 글상자에 이어서 입력한 글 · 같은 색 고르기는 1초 안에 이어지면 한 단계로 묶는다. 블록 삭제 확인 창은 없음(되돌리기로 복구).
- 2열 줄: `split`(왼쪽 너비 %, 20–80 정수, 없으면 50). 사이 손잡이를 끌어 조절(키보드 조작 없음). 두 블록은 같은 높이(더 높은 쪽) · 내용은 세로 가운데 · 위아래 여백은 줄에 한 번(`rowMargins`).
- 구분선 편집: 선 색 · 길이(px, 10–내용 칸 너비 `contentWidth`, 없으면 `widthPercent`) · 굵기(1–10px) · 스타일(실선 · 점선 · 1점 쇄선 · 2점 쇄선, `lineSegments` 로 조각을 만들어 화면은 span, 롤꾸 복사는 표 칸). 편집 화면에서만 구분선 블록의 위아래 12px 를 고르는 영역으로 넓힌다.
- 테두리(2026-11-26): 지원하지 않는다(사용자 결정). 모든 템플릿에서 틀 테두리를 지웠고 `frame.border` 도 없앴다(조사 기록 머리칸 아래 선은 구분선 블록).
- 색 고르기(`DesignPanel.tsx` ColorField): 로그 에디터처럼 동그라미 → 창(색 고르기 · 기본 색으로). 브라우저 색 창에서 끄는 동안(input)은 적용하지 않고 고른 색이 정해질 때(change) 한 번 적용. Chrome 은 Enter 와 창 바깥 클릭 모두 change 로 확정하고, Esc 는 취소. HEX 직접 입력도 있음.
- 공백 블록(`type: 'space'`, `height` 1–200px, 새 공백 16px): 블록 사이 간격. 템플릿에서 블록을 만들 때(`deriveRows` → `withSpacers`) 블록 위아래 여백을 공백 블록으로 바꾸고(맞닿은 여백은 큰 쪽) 블록 여백은 0. 이미 `layout.rows` 가 저장된 핸드아웃은 저장된 여백을 그대로 둔다. 2열 불가, 편집 화면에서만 점선 · '공백 Npx' 표시, 롤꾸 복사는 높이만큼의 빈 표 칸.
- 세로 정렬(위 · 가운데 · 아래): 글상자 · 이미지 블록의 `valign`(없으면 가운데). 편집 옵션은 1열에도 나오지만 모양은 2열 줄에서만 보인다. 롤꾸 복사는 2열 칸의 valign.
- 템플릿 선택 창(2026-11-27, `pages/TemplatePicker.tsx`): 템플릿 아카이브의 내 핸드아웃(최근 수정순, 열 때마다 새로 불러옴), 카드는 미리보기 · 이름 · '이 템플릿 사용하기'(사본, `useCopyHandout`), 이름 검색. 아카이브가 비어 있을 때는 기본 핸드아웃 "핸드아웃 샘플"만 보여 준다(2026-11-27).
- 여러 개 고르기(2026-11-27): Ctrl(Cmd)+누르기로 같은 종류(`blockKind`: 글상자 · 이미지 · 구분선 · 공백)만 더하거나 뺀다. 다른 종류는 무시하고 지금 선택 유지. 편집 칸은 처음 고른 블록 값을 보여 주고 바꾼 값을 모두에 적용(되돌리기 한 번), 굵게 · 기울임은 하나라도 꺼져 있으면 모두 켬. 여러 개를 고르면 옮기기 손잡이는 숨김. 휴대폰(터치)에서는 쓰지 않음. 블록 손잡이 ↑ ↓ 키 · 2열 ← → 키 옮기기는 없앴다.
- 글상자 자간(`letterSpacing` px, 0.5 단위, −5–20) · 행간(`lineHeight` 배수, 0.1 단위, 0.8–3): 가로 정렬 위.
- 일부 글자 꾸밈(2026-11-27, `richText.ts` · `canvas/RichField.tsx` · `canvas/richDom.ts`): 글상자 `runs: [{t, s?}]`(블록 꾸밈과 다른 값만, 꾸밈이 없으면 runs 없음 · text 는 runs 를 이은 값). 글상자 안에서 드래그한 범위가 있으면(글상자 하나만 고른 경우) 색 · 굵게 · 기울임 · 밑줄 · 취소선 · 크기 · 자간 · 행간이 그 글자에만, 없으면(손잡이 · 커서만) 글상자 전체에 적용하고 조각의 같은 꾸밈은 지운다. 정렬은 항상 전체. 범위는 패널로 포커스가 옮겨가도 유지하고 CSS Custom Highlight(`::highlight(hb-range)`)로 칠해 둔다. 단축키 Ctrl/Cmd+B · I · U · D 는 글상자를 골랐을 때만(입력칸은 브라우저 기본). 밑줄 · 취소선은 항상 조각 span 에서 그린다(바깥 꾸밈은 안쪽에서 끌 수 없어서).
- 초기화: 되돌리기 아래 버튼 → 확인 창 → `resetToTemplate`(템플릿 기본 content 로, 제목은 그대로). 되돌리기로 복구 가능.
- 이미지 편집은 주소만 (대체 텍스트 입력 없음, 저장된 alt 는 그대로 출력에 씀).
- 글상자 정렬(왼쪽 · 가운데 · 오른쪽). 이미지는 항상 블록 너비 100%, 높이는 원본 비율(템플릿의 maxWidth 는 쓰지 않음).

**사이드바·홈 개편 (2026-11-26 배포 완료)**
- 상단바·사이드바(2026-11-27 개편): 상단바가 맨 위 전체 폭이고 왼쪽에 사이트 아이콘·ORarchive·부제(PC만, `TopBrand`). 주사위 아이콘이 사이드바 접기·펴기 버튼(`lib/sidebar.ts`, 2026-11-27), 이름·부제를 누르면 홈. 경로(Workspace › 화면) 표시는 없앴다. 오른쪽은 동기화 표시·계정. 사이드바는 상단바 아래, 메뉴와 '내 클라우드 공간'만. 넓은 화면은 접으면 완전히 사라지고 이 기기에 기억(`folio-sidebar-collapsed`). 1050px 이하(휴대폰 포함)는 평소 없음, 버튼으로 상단바 아래 서랍을 열고 메뉴를 고르거나 바깥·Esc 로 닫힘. 하단 메뉴는 없음. 움직임(2026-11-27): 넓은 화면은 폭 248↔0 을 0.28초(cubic-bezier(.22,.61,.36,1))로, 메뉴 글자는 폭 고정·흐려짐. 긴 로그 편집 화면(`.app:has(.log-editor)`)은 매 프레임 다시 그리지 않게 사이드바만 미끄러지고 본문 폭은 한 번에. 서랍은 닫을 때도 끝까지 미끄러진 뒤 감추고 배경은 서서히. 움직임 줄이기 설정이면 효과 없음. 접힌 사이드바는 `inert`·`aria-hidden`.
- 메뉴(2026-11-27 개편): 템플릿 아카이브(템플릿 목록 `/templates` · 핸드아웃 편집 `/studio/handout` · 롤꾸코드 편집 `/studio/roll20code`, 준비 중) · 로그 아카이브(로그 목록 `/logs` · Roll20 로그 편집 `/studio/log/roll20` · 코코포리아 로그 편집 `/studio/log/ccfolia`) · 캐릭터 아카이브(`/characters`) · 설정(계정 설정, 화면 전환 토글). 예전 주소 `/templates/roll20` → 템플릿 목록, `/studio/log` → 로그 목록. 템플릿 목록에는 나중에 롤꾸코드 목록도, 로그 목록에는 코코포리아 로그도 함께 보인다. 상위 메뉴는 아이콘, 하위 메뉴는 아이콘 없이 들여쓰기. 1050px 이하로 접히면 상위 아이콘만 보이고 누르면 하위 메뉴 말풍선.
- 대시보드·내 프로젝트·내 보관함(`/library`)과 '새 문서' 창은 삭제했습니다. 1단계에서 만든 로그·캐릭터 문서는 로그 에디터·캐릭터 아카이브를 만들 때 그쪽 목록에 보여 줍니다(데이터는 그대로 있음).
- 템플릿 아카이브 › 템플릿 목록: 내 핸드아웃(미리보기/목록 토글, 삭제, 새 핸드아웃 버튼). 핸드아웃을 고르면 미리보기 창이 뜨고, "이 템플릿 사용하기"는 사본(`useCopyHandout`, 저장 값 그대로 복사)을 만들어 열고, "원본 편집"은 원본을 엽니다. 핸드아웃 편집 메뉴는 검색이 있는 템플릿 선택 창을 띄웁니다(2026-11-26 배포).
- 홈(`/`): 바로가기 2분할(템플릿 목록 · 로그 목록, 2026-11-27) · 최근 연 템플릿 4개(핸드아웃+롤꾸코드) · 최근 연 캐릭터 4개 (2026-11-26 순서 변경).
- 브랜드(2026-11-26): 사이드바 'ORarchive / ORPG를 위한 툴 아카이브', 사이트 아이콘은 금색 눈 5 주사위를 시계 방향 45도로 돌린 직접 그린 SVG(`Brand.tsx`, `public/favicon.svg`, 2026-11-27). 브라우저 탭 제목도 '· ORarchive'. 사이드바 아래 계정 칸은 삭제하고 '내 클라우드 공간' 칸이 그 자리. 서비스 이름은 ORarchive로 확정, 화면의 FOLIO 표기는 모두 바꿨다(내부 저장소 키 `folio-*`·`FolioClient` 는 유지). 최근 조회 기록은 기기별 localStorage(`src/lib/recentViews.ts`). 캐릭터·Roll20 코드 화면을 만들 때 `recordRecentView`를 호출해야 홈에 나옵니다.
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
- 로그 아카이브 › 로그 목록(`/logs`): 내 로그 목록 + 오른쪽 위 '새 로그 불러오기'. Roll20 로그 편집 메뉴는 핸드아웃 편집처럼 등록 창을 바로 띄운다(닫으면 이전 화면, 바로 들어왔으면 로그 목록). 불러오기 창에서 HTML 파일 올리기 또는 채팅 아카이브 페이지 붙여넣기(Ctrl+A → Ctrl+C → Ctrl+V, 레퍼런스 4 방식).
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

## 5-1. 롤꾸코드 편집 (2026-11-28 배포)
- 새 문서 종류 `roll20code` (content: `{format:'roll20-code', v:1, code}`), 마이그레이션 `0002_roll20code.sql` 적용 완료(실제 저장·삭제로 확인).
- 코드: `src/features/roll20code/` — `parse.ts`(링크 `[글자](#" style="…")` 읽기 · 괄호 짝 맞추기 · 같은 색 묶기 · 그 자리만 고치기 · 채팅 모양 그리기), `model.ts`(문서 형식 · 새 롤꾸코드 경로), `testSamples.ts`(테스트용 샘플 3종 — 앱에는 기본 제공 롤꾸 없음), `editor/`(미리보기 + 꾸미기 카드 + 편집 패널), `pages/Roll20CodeStartPage.tsx`(선택 창: 내 롤꾸코드만 + 새 롤꾸코드). 새 롤꾸코드는 `/studio/roll20code/new` 빈 편집기에서 처음 입력할 때 문서를 만들고, 만드는 동안 입력한 내용은 `location.state.r20Pending`으로 넘겨 한 번 반영한다.
- 여러 메시지(2026-11-28): `parse.ts`의 `messageSpans`(질문 안 줄바꿈은 이어 붙임) · `messageSlots` · `imageMessages` · `fontProps`/`setFontValue` · `colorGroups(code, message)`. 미리보기(`ChatPreview`)는 메시지마다 `data-msg`를 달고 누르면 고른다. 테스트용 여러 줄 샘플 3종도 `testSamples.ts`.
- 다음: 스타일 프리셋은 나중에.

## 5-2. 수동 저장 (2026-11-28 배포)
- 동기화 계층(`documentSync.ts`)에 `manual` 옵션: 입력은 그대로 IndexedDB 기록, `saveNow()`를 부를 때만 전송(누른 한 번만, 저장 중 입력은 '저장하지 않음'으로 남음), 실패 시 자동 재시도 없음, `discardChanges()`로 버리기. 기록에 `manual: true` → `backgroundSync.ts`가 보내지 않고 상단 목록에 "저장하지 않음 · 열어서 저장"으로 표시. 회귀 테스트는 `documentSync.test.ts`의 '수동 저장' 묶음.
- 화면 부품: `components/document/ManualSave.tsx`(저장 버튼 · 남은 변경 안내), `useManualSave.tsx`(Ctrl+S · useBlocker 나가기 창 · beforeunload · 새 문서 저장 중 입력 넘겨받기 `pendingDraft`).
- 라우터를 `createBrowserRouter`(테스트는 `createMemoryRouter`)로 바꿈 — App 의 `<Routes>`는 그대로.

## 5-3. UI 개편 1 · 2단계 (2026-11-28 배포)
- 공통 틀 · 홈 · 템플릿 목록 · 로그 목록. 색은 의미 토큰(`styles/tokens.css`, 다크는 `theme-dark.css` 맨 위)만 쓴다: `--bg` `--surface` `--surface-2/3` `--text` `--text-muted/faint` `--point(-weak/-line)` `--warn*` `--danger*` `--select-bg` `--chip-blue-*` `--chip-green-*`. 예전 이름(`--gold`, `--green` …)은 새 토큰을 가리키는 별칭으로만 남김.
- 그림자 · 그라데이션 · 세리프 없음, 모서리 4px(`--radius`).
- 선택 표시(사이드바 메뉴 · 분할 버튼 `.segmented`)는 강조 상자(`--select-bg`) + 굵게만, 포인트색 없음.
- `.press-accent`(홈 편집 바로가기 · 편집기 저장): 평소 무채색, 마우스 올림 때만 포인트색. 휴대폰(hover: none)은 `usePressAccent`로 0.16초 강조 후 이동(저장은 곧바로).
- 라이트/다크 전환은 사이드바 설정 > 계정 설정 아래 "화면 전환" 스위치(`Sidebar.tsx`의 `ThemeToggle`, `routes.ts`의 `themeToggle`). 처음엔 기기 설정, 누르면 기억(`folio-theme`).
- 2단계: 편집기(`HandoutStudio.css`, `HandoutCanvas.css` 편집 표시, `roll20Code.css`, `roll20Log.css`, 그림자 DOM 안 `LogPreview.tsx`의 OVERLAY_CSS · `ChatPreview.tsx`)도 토큰만 씀 — 그림자 DOM 은 CSS 변수를 물려받는다. 파일별 다크 덮어쓰기는 없앴고 `theme-dark.css`는 토큰 값만.
- 삭제류 버튼은 `.btn.danger`(중대 경고색 테두리), 목록 휴지통은 `.row-icon.is-delete`(아이콘 색만). 편집기 저장은 `.btn.primary`.

## 6. 참고 자료
- 데이터베이스 설정 절차: `supabase/README.md`
- 화면 기록: `docs/screens/`
- 기획 출처: ChatGPT 기획 대화와 claude.ai 목업 대화. 주요 내용은 `CLAUDE.md`의 "확정된 결정"에 정리되어 있습니다.
