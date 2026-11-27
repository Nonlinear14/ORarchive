import { describe, expect, it } from 'vitest'
import { ROLL20_CODE_STARTERS } from './model'
import {
  allDesc,
  colorGroups,
  colorUsageLabel,
  fillQueries,
  italicRemoved,
  parseCode,
  renderChatHtml,
  setColor,
  setDesc,
  setItalicRemoved,
  setSlotText,
  slotAsQuery,
  textSlots,
  uniqueQueries,
} from './parse'

const [judge, chapter, full] = ROLL20_CODE_STARTERS.map((s) => s.code)

describe('롤꾸 코드 읽기', () => {
  it('판정 버튼: 끝의 linear-gradient( ) 괄호가 링크의 끝을 겸한다', () => {
    const [line] = parseCode(judge)
    expect(line.kind).toBe('desc')
    const slots = textSlots(judge)
    expect(slots).toHaveLength(1)
    expect(slots[0].text).toBe('✷　?{기능|} 판정　✷')
    expect(slots[0].style).toMatch(/linear-gradient\(135deg, #FF0053, #FFD444\)$/)
  })

  it('챕터 표시: 링크 두 개 · 같은 색은 한 묶음(배경 · 그림자 4곳)', () => {
    expect(textSlots(chapter).map((s) => s.text)).toEqual(['─────── CHAPTER ?{챕터 숫자|} ───────', '?{챕터명|}'])
    const groups = colorGroups(chapter)
    expect(groups.map((g) => g.hex)).toEqual(['#F5C542', '#EE1B60', '#FFFFFF'])
    const pink = groups[1]
    expect(pink.uses).toHaveLength(4)
    expect(colorUsageLabel(pink)).toBe('배경 · 그림자')
    expect(uniqueQueries(chapter).map((q) => q.label)).toEqual(['챕터 숫자', '챕터명'])
  })

  it('white 같은 색 이름도 색으로 · 질문은 예시 답(없으면 질문 이름)으로 채운다', () => {
    expect(colorGroups(judge).map((g) => g.hex)).toEqual(['#FFFFFF', '#FF0053', '#FFD444'])
    expect(fillQueries(judge, {})).toContain('✷　기능 판정　✷')
    expect(fillQueries(judge, { 기능: '관찰력' })).toContain('✷　관찰력 판정　✷')
    expect(fillQueries('?{고르기|가,A|나,B}', {})).toBe('A')
  })
})

describe('롤꾸 코드 고치기 (그 자리만 바뀐다)', () => {
  it('글자 · 색 · /desc · 기울임', () => {
    const slot = textSlots(full)[0]
    const next = setSlotText(full, slot, '비가 내린다]')
    expect(next).toBe(full.replace('?{내용|}', '비가 내린다］'))
    const green = colorGroups(full).find((g) => g.hex === '#87BD00')!
    const recolored = setColor(full, green, '#123456')
    expect(recolored).toBe(full.replaceAll('#87BD00', '#123456'))
    expect(allDesc(full)).toBe(true)
    expect(setDesc(full, false)).toBe(full.replace(/^\/desc /, ''))
    expect(setDesc(setDesc(full, false), true)).toBe(full)
    expect(italicRemoved(full)).toBe(false)
    const plain = setItalicRemoved(full, true)
    expect(italicRemoved(plain)).toBe(true)
    expect(setItalicRemoved(plain, false)).toBe(full)
    expect(slotAsQuery('안녕', 1)).toBe('?{내용2|안녕}')
  })
})

describe('Roll20 채팅 모양으로 그리기', () => {
  it('스타일은 링크에 · 사용자 글자는 이스케이프 · 위험한 값은 걷어 낸다', () => {
    const html = renderChatHtml('/desc [<b>안녕</b>](#" style="color:red; background:url(javascript:alert(1)); expression(x))', {})
    expect(html).toContain('class="message desc"')
    expect(html).toContain('&lt;b&gt;안녕&lt;/b&gt;')
    expect(html).not.toMatch(/javascript|expression\(/i)
    expect(renderChatHtml(chapter, {})).toContain('CHAPTER 챕터 숫자')
  })
})
