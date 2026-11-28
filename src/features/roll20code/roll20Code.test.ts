import { describe, expect, it } from 'vitest'
import { MULTI_IMAGE_MACRO, MULTI_IMAGES, MULTI_MIXED, ROLL20_CODE_SAMPLES } from './testSamples'
import {
  allDesc,
  colorGroups,
  colorUsageLabel,
  fillQueries,
  fontProps,
  imageMessages,
  italicRemoved,
  messageSlots,
  messageSpans,
  parseCode,
  renderChatHtml,
  setColor,
  setDesc,
  setFontValue,
  setImageUrl,
  setItalicRemoved,
  setSlotText,
  slotAsQuery,
  textSlots,
  uniqueQueries,
} from './parse'

const [judge, chapter, full] = ROLL20_CODE_SAMPLES.map((s) => s.code)

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

describe('여러 줄 롤꾸', () => {
  it('메시지 나누기: 질문 안 줄바꿈은 같은 메시지', () => {
    expect(messageSpans(MULTI_MIXED)).toHaveLength(9)
    expect(messageSpans(MULTI_IMAGES)).toHaveLength(3)
    expect(messageSpans(MULTI_IMAGE_MACRO)).toHaveLength(1)
    expect(imageMessages(MULTI_MIXED).map((i) => i.message)).toEqual([0, 5, 8])
    const [macro] = imageMessages(MULTI_IMAGE_MACRO)
    expect(macro.asked).toBe(true)
  })

  it('질문 보기: 앞뒤 줄바꿈을 걷고, 빈 보기는 빼고, ---------- 는 구분선', () => {
    const [q] = uniqueQueries(MULTI_IMAGE_MACRO)
    expect(q.options[0]).toEqual({ name: '도입', value: 'cyTkpDF' })
    expect(q.options.filter((o) => o.separator)).toHaveLength(3)
    expect(q.options.at(-1)).toEqual({ name: '전투종료', value: 'mFmZOWj' })
    expect(q.options.some((o) => !o.name && !o.value)).toBe(false)
    expect(renderChatHtml(MULTI_IMAGE_MACRO, { 선택: 'K6NPmsb' })).toContain('<img src="https://imgur.com/K6NPmsb.png"')
  })

  it('/desc 끄고 켜기는 메시지 머리에만 (질문 속 줄은 건드리지 않는다)', () => {
    const off = setDesc(MULTI_IMAGE_MACRO, false)
    expect(off).toBe(MULTI_IMAGE_MACRO.replace(/^\/desc /, ''))
    expect(setDesc(off, true)).toBe(MULTI_IMAGE_MACRO)
    expect(setDesc(setDesc(MULTI_MIXED, false), true)).toBe(MULTI_MIXED)
  })

  it('메시지를 고르면 그 메시지의 색만 바뀐다 · 전체에서는 함께', () => {
    const pinkInPc = colorGroups(MULTI_MIXED, 6).find((g) => g.hex === '#F16A66')!
    const next = setColor(MULTI_MIXED, pinkInPc, '#000000')
    expect(next.split('\n')[6]).toContain('#000000')
    expect(next.split('\n')[1]).toContain('#F16A66')
    expect(colorGroups(MULTI_MIXED).find((g) => g.hex === '#F16A66')!.uses).toHaveLength(3)
  })

  it('글꼴: 있는 속성만 · 그 값 자리만 바뀐다', () => {
    const slot = messageSlots(MULTI_MIXED).filter((s) => s.message === 2)[0].slot
    const props = fontProps(slot)
    expect(props.map((p) => [p.property, p.value])).toEqual([
      ['font-size', '11px'],
      ['font-weight', 'normal'],
    ])
    const next = setFontValue(MULTI_MIXED, props[0], '14px')
    expect(next).toBe(MULTI_MIXED.replace('font-weight: normal; font-size: 11px;)[', 'font-weight: normal; font-size: 14px;)['))
    const important = fontProps(textSlots('[a](#" style="font-size: 12px !important; color:red")')[0])
    expect(important[0].value).toBe('12px')
  })

  it('이미지 주소 바꾸기', () => {
    const img = imageMessages(MULTI_IMAGES)[1]
    expect(setImageUrl(MULTI_IMAGES, img, 'https://i.imgur.com/new.png')).toBe(MULTI_IMAGES.replace('https://i.imgur.com/k5lEBRJ.png', 'https://i.imgur.com/new.png'))
  })
})
