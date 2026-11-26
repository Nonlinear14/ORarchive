import { describe, expect, it } from 'vitest'
import type { DocumentContent } from '../../../lib/documents'
import {
  countMatches,
  duplicateMessage,
  insertMessageAfter,
  moveMessage,
  removeMessage,
  removeSpeakerMessages,
  replaceAll,
  setCharacter,
  setMessageText,
  setOption,
} from './edits'
import { inlineCss, logBlogCode, logFileName, logHtmlFile } from './export'
import { isRoll20Log, resolveLog, serializeLog } from './model'
import { detectRule, parseRoll20Log, Roll20ParseError } from './parse'
import { logCss, renderMessagesHtml, textToHtml, visibleMessages } from './render'
import { editableHtmlToText } from './editor/inlineText'
import { isUsableAvatar } from './model'

/** 실제 Roll20 채팅 아카이브와 같은 구조의 작은 예시 (대사는 지어낸 내용) */
const SAMPLE = `<!DOCTYPE html><html><head><title>Chat Log for 안개 낀 도서관</title>
<style>.unrelated{color:red}</style>
<style>.sheet-rolltemplate-coc-1 table{width:100%;border:1px solid black} .sheet-rolltemplate-coc-1 caption{background:black;color:white} @import url(https://evil.example/x.css);</style>
</head><body>
<div class="textchatcontainer" id="textchat"><div class="content">
<div class="message desc" data-messageid="-a1"><div class="spacer"></div> 1923년 가을, 아컴.<div id="menu-a1" class="flyout"></div></div>
<div class="message general" data-messageid="-a2"><div class="spacer"></div><div class="avatar" aria-hidden="true"><img src="https://files.d20.io/images/1/med.png"></div><span class="tstamp" aria-hidden="true">November 20, 2026 9:04PM</span><span class="by">엘리너:</span>여기 서가 번호가 <strong>이상해요</strong>.<br>목록에는 있는데요.<div id="menu-a2" class="flyout"></div></div>
<div class="message general" data-messageid="-a3">누가 빼 간 것 같지 않아요? <span class="inlinerollresult showtip fullcrit" title="Rolling 1d2">2</span><div id="menu-a3" class="flyout"></div></div>
<div class="message general you" data-messageid="-a4"><div class="spacer"></div><div class="avatar" aria-hidden="true"><img src="./Chat Log_files/med(1).png"></div><span class="tstamp">November 20, 2026 9:05PM</span><span class="by">GM 하워드 (GM):</span><div class="sheet-rolltemplate-coc-1"><table><caption>관찰력</caption><tbody><tr><td>굴림:</td><td><span class="inlinerollresult">23</span></td></tr></tbody></table></div><div id="menu-a4" class="flyout"></div></div>
<div class="message private whisper" data-messageid="-a5"><div class="spacer"></div><div class="avatar"><img src="https://files.d20.io/images/1/med.png"></div><span class="tstamp">x</span><span class="by">(From 엘리너):</span> 발자국 크기 기억나세요?<div id="menu-a5" class="flyout"></div></div>
<div class="message hidden-message" data-messageid="-a6" style="font-style: italic;"><div class="spacer"></div><div class="avatar"><img src="https://files.d20.io/images/1/med.png"></div><span class="by">엘리너:</span>This message has been hidden.</div>
<div class="message general" data-messageid="-a7"><div class="spacer"></div><div class="avatar"><img src="https://files.d20.io/images/1/med.png"></div><span class="by">엘리너:</span><a style="color: #000; border: 2px solid #000" href="javascript:alert(1)" onclick="alert(2)">꾸민 상자</a><img src="x" onerror="alert(3)"><script>alert(4)</script></div>
</div></div>
<script id="tmpl_chatmessage_general" type="text/html"><div class='message general'>템플릿</div></script>
</body></html>`

const parsed = () => parseRoll20Log(SAMPLE, 'Chat Log for 안개 낀 도서관.html')

describe('Roll20 로그 읽기', () => {
  it('메시지 종류·화자·이어지는 메시지·통계를 읽는다', () => {
    const { content, stats, title } = parsed()
    expect(title).toBe('안개 낀 도서관')
    expect(content.messages.map((m) => m.kind)).toEqual(['desc', 'general', 'general', 'general', 'whisper', 'hidden', 'general'])
    const [desc, first, continued, roll, whisper] = content.messages
    expect(desc).toMatchObject({ kind: 'desc', text: '1923년 가을, 아컴.' })
    expect(first).toMatchObject({
      speaker: '엘리너',
      avatar: 'https://files.d20.io/images/1/med.png',
      ts: 'November 20, 2026 9:04PM',
      text: '여기 서가 번호가 **이상해요**.\n목록에는 있는데요.',
    })
    // 이름이 생략된 이어지는 메시지는 앞사람을 이어받고, 인라인 굴림이 있어 수정 불가(html)
    expect(continued).toMatchObject({ speaker: '엘리너', avatar: 'https://files.d20.io/images/1/med.png' })
    expect(continued.text).toBeUndefined()
    expect(continued.html).toContain('inlinerollresult')
    expect(roll).toMatchObject({ speaker: 'GM 하워드 (GM)', you: true })
    expect(roll.html).toContain('sheet-rolltemplate-coc-1')
    expect(whisper).toMatchObject({ speaker: '엘리너', whisper: 'from', text: '발자국 크기 기억나세요?' })
    expect(stats).toMatchObject({ messages: 7, speakers: 2, whispers: 1, hidden: 1, rolls: 1, brokenAvatars: 1, sheetCss: true, rule: '크툴루의 부름' })
    expect(content.rule).toBe('크툴루의 부름')
  })

  it('다른 사람이 쓴 HTML 의 스크립트·이벤트·javascript: 주소를 지우고, 시트 CSS 의 @import 를 지운다', () => {
    const { content } = parsed()
    const boxed = content.messages[6]
    expect(boxed.html).toContain('꾸민 상자')
    expect(boxed.html).toContain('border: 2px solid')
    expect(boxed.html).not.toMatch(/onclick|onerror|javascript:|<script/i)
    expect(content.sheetCss).toContain('.sheet-rolltemplate-coc-1 table')
    expect(content.sheetCss).not.toContain('@import')
    expect(content.sheetCss).not.toContain('.unrelated')
    // <script type=text/html> 안의 템플릿은 메시지로 읽지 않는다
    expect(content.messages.some((m) => (m.text ?? m.html ?? '').includes('템플릿'))).toBe(false)
  })

  it('복사해 붙여 넣은 조각(#textchat 없이 메시지만)도 읽고, 메시지가 없으면 알려 준다', () => {
    const fragment = `<div class="message general"><div class="spacer"></div><span class="by">토마스:</span>안녕하세요</div>`
    expect(parseRoll20Log(fragment).content.messages).toEqual([expect.objectContaining({ speaker: '토마스', text: '안녕하세요' })])
    expect(() => parseRoll20Log('<p>그냥 글</p>')).toThrow(Roll20ParseError)
  })

  it('저장 형식: 직렬화 → 검사·정규화가 같은 내용을 돌려준다', () => {
    const { content } = parsed()
    const stored = serializeLog(content)
    expect(isRoll20Log(stored)).toBe(true)
    expect(resolveLog(stored)).toEqual(content)
    expect(isRoll20Log({ text: 'Phase 1' })).toBe(false)
  })
})

describe('Roll20 로그 편집 연산 (고친 경로만 바뀐다)', () => {
  const stored = (): DocumentContent => ({ ...serializeLog(parsed().content), extra: { keep: true } })

  it('글자 수정은 수정 가능한 메시지만, 다른 값은 그대로', () => {
    const s = stored()
    const after = setMessageText('-a2', '고친 대사')(s)
    expect(resolveLog(after).messages[1].text).toBe('고친 대사')
    expect(after.extra).toBe(s.extra)
    expect((after.messages as unknown[])[0]).toBe((s.messages as unknown[])[0])
    // 수정 불가 메시지는 바뀌지 않는다
    expect(setMessageText('-a4', '판정 고치기')(s)).toBe(s)
  })

  it('복제·이동·삭제·아래에 추가', () => {
    const s = stored()
    const ids = (c: DocumentContent) => resolveLog(c).messages.map((m) => m.id)
    expect(ids(duplicateMessage('-a2', 'copy')(s)).slice(1, 3)).toEqual(['-a2', 'copy'])
    expect(ids(moveMessage('-a2', -1)(s)).slice(0, 2)).toEqual(['-a2', '-a1'])
    expect(moveMessage('-a1', -1)(s)).toBe(s)
    expect(ids(removeMessage('-a3')(s))).not.toContain('-a3')
    const added = resolveLog(insertMessageAfter('-a2', 'new')(s)).messages[2]
    expect(added).toMatchObject({ id: 'new', kind: 'general', speaker: '엘리너', text: '' })
    expect(resolveLog(insertMessageAfter('-a1', 'd')(s)).messages[1]).toMatchObject({ kind: 'desc', text: '' })
  })

  it('캐릭터 설정·옵션·찾아 바꾸기·캐릭터 메시지 모두 삭제', () => {
    let s = stored()
    s = setCharacter('엘리너', 'name', '엘리너 B.')(s)
    s = setCharacter('엘리너', 'color', '#aa3300')(s)
    s = setOption('hideWhispers', true)(s)
    const view = resolveLog(s)
    expect(view.characters['엘리너']).toEqual({ name: '엘리너 B.', color: '#aa3300' })
    expect(view.options.hideWhispers).toBe(true)
    expect(resolveLog(setCharacter('엘리너', 'name', '')(s)).characters['엘리너']).toEqual({ color: '#aa3300' })

    expect(countMatches(view.messages, '서가')).toBe(1)
    const replaced = resolveLog(replaceAll('서가', '책장')(s))
    expect(replaced.messages[1].text).toContain('책장')
    expect(replaceAll('없는 글자', 'x')(s)).toBe(s)

    expect(resolveLog(removeSpeakerMessages('엘리너')(s)).messages.map((m) => m.speaker)).toEqual([undefined, 'GM 하워드 (GM)'])
  })
})

/** User JavaScript and CSS 확장 프로그램이 넣는 것과 같은 구조 */
const EXT_STYLE = `<style data-source="User JavaScript and CSS">
@font-face{font-family:"GSans-M";src:url("https://cdn.example/g.woff")}
#macrobar{font-family:"GSans-M";height:auto}
.textchatcontainer .desc{background-color:#ffffff !important;color:#000 !important;font-family:"Pretendard-R" !important;font-size:17px !important}
.textchatcontainer .message .spacer{background-color:#ffffff}
.sheet-rolltemplate-coc-1 table{border:transparent;font-family:"Pretendard-R"}
</style>`

describe('확장 프로그램 꾸밈', () => {
  it('저장 파일: 확장 프로그램 블록에서 메시지·판정 표 꾸밈만 (글꼴·Roll20 화면 규칙 제외), 시트 CSS 와 분리', () => {
    const html = SAMPLE.replace('</head>', `<style type="text/css" title="charsheet">.sheet-rolltemplate-coc-1 caption{background:black}</style>${EXT_STYLE}</head>`)
    const { content, stats } = parseRoll20Log(html)
    expect(stats.extension).toBe(true)
    expect(content.extCss).toMatch(/\.textchatcontainer \.desc\{background-color: (#ffffff|rgb\(255, 255, 255\)) !important/)
    expect(content.extCss).toMatch(/\.textchatcontainer \.message \.spacer\{background-color: (#ffffff|rgb\(255, 255, 255\))\}/)
    expect(content.extCss).toMatch(/\.sheet-rolltemplate-coc-1 table\{border: transparent\}/)
    expect(content.extCss).not.toMatch(/font-family|@font-face|macrobar/)
    expect(content.sheetCss).toContain('caption{background:black}')
    expect(content.sheetCss).not.toContain('.textchatcontainer .desc')
    expect(parsed().stats.extension).toBe(false)
  })

  it('붙여넣기: 크롬이 넣은 style 속성을 메시지 종류별 규칙으로 되살리고, 글꼴·굳은 표 폭은 지운다', () => {
    const pasted = `<div class="textchatcontainer"><div class="content">
<div class="message desc" style="background-color: rgb(255, 255, 255); font-family: RIDIBatang; font-weight: bold !important;"><div class="spacer" style="background-color: rgb(255, 255, 255);"></div> 서술</div>
<div class="message general" style="background-color: rgb(250, 250, 250); color: rgb(0, 0, 0); font-family: RIDIBatang;"><div class="spacer" style="background-color: rgb(255, 255, 255);"></div><div class="avatar"><img src="https://files.d20.io/a.png"></div><span class="by" style="color: rgb(10, 10, 10);">엘리너:</span>대사</div>
<div class="message general" style="background-color: rgb(250, 250, 250); color: rgb(0, 0, 0);"><div class="spacer"></div><div class="avatar"><img src="https://files.d20.io/a.png"></div><span class="by">엘리너:</span><div class="sheet-rolltemplate-coc-1"><table style="width: 1384px; border: transparent; max-width: 100%;"><caption style="font-family: Pretendard-R; color: rgb(255, 255, 255);">관찰력</caption></table></div></div>
<div class="message hidden-message" style="font-style: italic; position: relative;"><div class="spacer"></div><span class="by">엘리너:</span>This message has been hidden.</div>
</div></div>`
    const { content, stats } = parseRoll20Log(pasted)
    expect(stats.extension).toBe(true)
    expect(content.extCss).toContain('.textchatcontainer .message.desc{background-color: rgb(255, 255, 255); font-weight: bold !important}')
    expect(content.extCss).toContain('.textchatcontainer .message.general{background-color: rgb(250, 250, 250); color: rgb(0, 0, 0)}')
    expect(content.extCss).toContain('.textchatcontainer .message.general .by{color: rgb(10, 10, 10)}')
    expect(content.extCss).not.toMatch(/font-family|hidden-message/)
    const roll = content.messages[2].html ?? ''
    expect(roll).toContain('border: transparent')
    expect(roll).not.toMatch(/1384px|font-family/)
    expect(content.messages[1].text).toBe('대사')

    const plain = pasted.replace(/ style="[^"]*"/g, '').replace('<div class="message hidden-message"', '<div class="message hidden-message" style="font-style: italic;"')
    expect(parseRoll20Log(plain).stats.extension).toBe(false)
  })

  it('CSS 순서: Roll20 기본 → 시트 → 확장 프로그램 → 표시 설정(구분선 끄기는 !important 로 모든 메시지에)', () => {
    const content = { ...parsed().content, extCss: '.textchatcontainer .message .spacer{background-color:#f00}' }
    const css = logCss(content)
    expect(css.indexOf('.sheet-rolltemplate-coc-1')).toBeLessThan(css.indexOf('background-color:#f00'))
    expect(css.indexOf('background-color:#f00')).toBeLessThan(css.indexOf('.nodivider'))
    expect(css).toContain('.textchatcontainer.nodivider .message .spacer{background:transparent!important')
  })
})

describe('바로 수정한 글자 읽기', () => {
  it('<b>·<i>·<br>·줄 <div> → 저장 형식', () => {
    const el = document.createElement('span')
    el.innerHTML = '가 <b>굵게</b> <i>기울임</i><br>둘째<div>셋째 <strong>강조</strong></div>'
    expect(editableHtmlToText(el)).toBe('가 **굵게** *기울임*\n둘째\n셋째 **강조**')
    el.innerHTML = '<b>붙</b><b>은</b> 굵게&nbsp;끝'
    expect(editableHtmlToText(el)).toBe('**붙은** 굵게 끝')
  })
})

describe('룰 감지 · 저널 주소', () => {
  it('시트 롤템플릿 이름으로 룰을 알아낸다', () => {
    expect(detectRule('<div class="sheet-rolltemplate-coc-1">')).toBe('크툴루의 부름')
    expect(detectRule('<div class="sheet-rolltemplate-InsDice">')).toBe('인세인')
    expect(detectRule('.sheet-rolltemplate-Ninpo{}')).toBe('인세인')
    expect(detectRule('<div class="sheet-rolltemplate-atkdmg">')).toBe('D&D 5판')
    expect(detectRule('<div class="sheet-rolltemplate-mysheet">')).toBe('')
    expect(detectRule('그냥 대화')).toBe('')
  })

  it('저널로 쓸 수 있는 주소: 웹 주소와 불러온 이미지(data:image)만', () => {
    expect(isUsableAvatar('https://files.d20.io/a.png')).toBe(true)
    expect(isUsableAvatar('data:image/png;base64,AAAA')).toBe(true)
    expect(isUsableAvatar('./Chat Log_files/med.png')).toBe(false)
    expect(isUsableAvatar('javascript:alert(1)')).toBe(false)
    expect(isUsableAvatar('data:text/html;base64,AAAA')).toBe(false)
  })
})

describe('Roll20 로그 그리기·내보내기', () => {
  it('글자는 이스케이프하고 *기울임* **굵게** 줄바꿈만 태그로', () => {
    expect(textToHtml('<b>&\n**굵게** *기울임*')).toBe('&lt;b&gt;&amp;<br><strong>굵게</strong> <em>기울임</em>')
  })

  it('일괄 정리 설정과 연속 이름 정리', () => {
    const content = parsed().content
    let shown = visibleMessages(content)
    expect(shown.map((r) => r.message.id)).not.toContain('-a6') // 숨긴 메시지 지우기 (기본 켜짐)
    expect(shown.find((r) => r.message.id === '-a3')?.showHeader).toBe(false) // 같은 사람이 이어 말함
    shown = visibleMessages({ ...content, options: { ...content.options, collapseNames: false, hideRolls: true, hideWhispers: true } })
    expect(shown.find((r) => r.message.id === '-a3')?.showHeader).toBe(true)
    expect(shown.map((r) => r.message.id)).not.toContain('-a4')
    expect(shown.map((r) => r.message.id)).not.toContain('-a5')
    const hiddenChar = visibleMessages({ ...content, characters: { 엘리너: { hidden: true } } })
    expect(hiddenChar.every((r) => r.message.speaker !== '엘리너')).toBe(true)
  })

  it('캐릭터 이름·색·저널이 머리에 반영되고, 귓속말은 (From 이름)', () => {
    const content = parsed().content
    const html = renderMessagesHtml({
      ...content,
      characters: { 엘리너: { name: '엘리너 <B>', color: '#aa3300', avatar: 'https://i.imgur.com/a.png' } },
    })
    expect(html).toContain('<span class="by" style="color:#aa3300 !important">엘리너 &lt;B&gt;:</span>')
    expect(html).toContain('(From 엘리너 &lt;B&gt;):')
    expect(html).toContain('src="https://i.imgur.com/a.png"')
    expect(html).toContain('class="message general you"')
  })

  it('캐릭터의 메시지 배경색·대사 색은 그 캐릭터의 모든 메시지에 (이어지는 메시지 포함), desc 서술은 서술 메시지에', () => {
    const content = parsed().content
    const html = renderMessagesHtml({
      ...content,
      characters: { 엘리너: { bg: '#ffeeaa', text: '#225588' }, __desc__: { text: '#333333' } },
    })
    expect(html.match(/style="background-color:#ffeeaa !important;color:#225588 !important"/g)).toHaveLength(4)
    expect(html).toContain('<div class="message desc" style="color:#333333 !important">')
  })

  it('HTML 파일: 완성된 페이지에 시트 CSS 포함 · 파일 이름 정리', () => {
    const page = logHtmlFile(parsed().content, '안개 <낀> 도서관')
    expect(page).toMatch(/^<!DOCTYPE html>/)
    expect(page).toContain('<title>안개 &lt;낀&gt; 도서관</title>')
    expect(page).toContain('.sheet-rolltemplate-coc-1 table')
    expect(page).toContain('class="textchatcontainer"')
    expect(logFileName('a/b:c*?')).toBe('a b c.html')
  })

  it('블로그용 코드: CSS 를 style 속성으로 옮기고 class 를 지운다', () => {
    expect(inlineCss('<div class="a"><span class="b" style="font-weight:bold">x</span></div>', '.a{color:red} .a .b{color:blue} .b{color:green}')).toBe(
      '<div style="color:red"><span style="color:blue;font-weight:bold">x</span></div>',
    )
    const code = logBlogCode(parsed().content)
    expect(code).not.toMatch(/class=|<style/)
    expect(code).toContain('background-color')
    expect(code).toContain('관찰력')
  })
})
