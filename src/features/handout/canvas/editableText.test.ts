import { describe, expect, it } from 'vitest'
import { seededRandom } from '../../../test/handoutCorpus'
import { displayText, readValue, renderedLines, singleLineInput, withoutLineBreaks, writeValue } from './editableText'

function dom(html: string): HTMLDivElement {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

/**
 * 실제 Chrome 에서 키를 눌러 얻은 DOM (white-space: pre-wrap) → 화면에 보이는 값.
 * `줄 수` 는 Chrome 이 그린 칸 높이 / 줄 높이 — 값의 줄 수(\n 개수 + 1)와 같아야 한다.
 */
const chromeCases: { mode: string; keys: string; html: string; value: string; lines: number }[] = [
  { mode: 'plaintext-only', keys: 'Enter (빈 칸)', html: '\n\n', value: '\n', lines: 2 },
  { mode: 'plaintext-only', keys: 'Enter Enter', html: '\n\n\n', value: '\n\n', lines: 3 },
  { mode: 'plaintext-only', keys: 'Enter abc', html: '\nabc', value: '\nabc', lines: 2 },
  { mode: 'plaintext-only', keys: 'Enter Enter abc', html: '\n\nabc', value: '\n\nabc', lines: 3 },
  { mode: 'plaintext-only', keys: 'abc Enter', html: 'abc\n\n', value: 'abc\n', lines: 2 },
  { mode: 'plaintext-only', keys: 'abc Enter def', html: 'abc\ndef', value: 'abc\ndef', lines: 2 },
  { mode: 'plaintext-only', keys: 'abc Enter Enter', html: 'abc\n\n\n', value: 'abc\n\n', lines: 3 },
  { mode: 'plaintext-only', keys: 'abc Enter x Backspace', html: 'abc\n<br>', value: 'abc\n', lines: 2 },
  { mode: 'plaintext-only', keys: 'abc Ctrl+A Delete', html: '<br>', value: '', lines: 1 },
  { mode: 'plaintext-only', keys: 'Enter Backspace', html: '\n', value: '', lines: 1 },
  { mode: 'plaintext-only', keys: 'a␠␠', html: 'a  ', value: 'a  ', lines: 1 },
  { mode: 'true', keys: 'Enter (빈 칸)', html: '<div><br></div><div><br></div>', value: '\n', lines: 2 },
  { mode: 'true', keys: 'Enter Enter', html: '<div><br></div><div><br></div><div><br></div>', value: '\n\n', lines: 3 },
  { mode: 'true', keys: 'Enter abc', html: '<div><br></div><div>abc</div>', value: '\nabc', lines: 2 },
  { mode: 'true', keys: 'Enter Enter abc', html: '<div><br></div><div><br></div><div>abc</div>', value: '\n\nabc', lines: 3 },
  { mode: 'true', keys: 'abc Enter', html: 'abc<div><br></div>', value: 'abc\n', lines: 2 },
  { mode: 'true', keys: 'abc Enter def', html: 'abc<div>def</div>', value: 'abc\ndef', lines: 2 },
  { mode: 'true', keys: 'abc Enter Enter', html: 'abc<div><br></div><div><br></div>', value: 'abc\n\n', lines: 3 },
  { mode: 'true', keys: 'abc Ctrl+A Delete', html: '<br>', value: '', lines: 1 },
  { mode: 'true', keys: 'Enter Backspace', html: '<div><br></div>', value: '', lines: 1 },
  { mode: 'true', keys: 'Shift+Enter (빈 칸)', html: '\n\n', value: '\n', lines: 2 },
]

describe('readValue — 화면(DOM) → 저장 값', () => {
  it.each(chromeCases)('$mode · $keys → $value', ({ html, value, lines }) => {
    const el = dom(html)
    expect(readValue(el)).toBe(value)
    expect(value.split('\n')).toHaveLength(lines)
  })

  it('브라우저가 빈 칸에 남기는 자리 표시만 있으면 빈 값', () => {
    for (const html of ['', '<br>', '\n', '<div><br></div>', '<div></div>', '<span></span>', '<p><br></p>']) {
      expect(readValue(dom(html))).toBe('')
    }
  })

  it('줄바꿈만 있는 값은 빈 값이 아니다 (회귀: Enter 한 빈 줄이 지워지던 문제)', () => {
    expect(readValue(dom('\n\n'))).toBe('\n')
    expect(readValue(dom('<br><br>'))).toBe('\n')
    expect(readValue(dom('\n<br>'))).toBe('\n')
    expect(readValue(dom('\n\n\n'))).toBe('\n\n')
  })

  it('블록 끝의 줄바꿈 하나만 자리 표시로 보고, 나머지 줄바꿈 · 공백은 그대로', () => {
    expect(readValue(dom('a\n\n\n\n'))).toBe('a\n\n\n')
    expect(readValue(dom('  \n  '))).toBe('  \n  ')
    expect(readValue(dom('<div>abc<br><br></div>'))).toBe('abc\n')
    expect(readValue(dom('abc<br><div>def</div>'))).toBe('abc\ndef')
    expect(readValue(dom('<div>abc</div>def'))).toBe('abc\ndef')
    expect(readValue(dom('a<span>b<br>c</span>d'))).toBe('ab\ncd')
    expect(readValue(dom('<div><div>a</div><div><br></div></div><div>b</div>'))).toBe('a\n\nb')
  })

  it('renderedLines 는 아주 긴 글도 자르지 않는다', () => {
    const el = document.createElement('div')
    el.textContent = `${'줄\n'.repeat(150_000)}끝`
    expect(renderedLines(el)).toHaveLength(150_001)
    expect(readValue(el)).toBe(el.textContent)
  })
})

describe('한 줄 칸 — 새로 들어온 줄바꿈만 막는다 (저장돼 있던 글자는 줄바꿈까지 그대로)', () => {
  it('readValue 는 한 줄 칸에도 보이는 그대로 (회귀: 저장된 줄바꿈이 공백으로 바뀌고 끝 줄바꿈이 지워지던 문제)', () => {
    expect(readValue(dom('a\nb'))).toBe('a\nb')
    expect(readValue(dom('abc\n\n'))).toBe('abc\n')
    expect(readValue(dom('a<div>b</div>'))).toBe('a\nb')
    expect(readValue(dom('  끝  '))).toBe('  끝  ')
  })

  it('withoutLineBreaks: 글 사이 줄바꿈(둘레 공백 포함)은 공백 하나로, 앞뒤 줄바꿈은 없앤다', () => {
    expect(withoutLineBreaks('붙인\n  제목')).toBe('붙인 제목')
    expect(withoutLineBreaks('a \n\n \t b')).toBe('a b')
    expect(withoutLineBreaks('a\r\nb')).toBe('a b')
    expect(withoutLineBreaks('\n')).toBe('')
    expect(withoutLineBreaks(' \n\n ')).toBe('')
    expect(withoutLineBreaks('\n제목\n')).toBe('제목')
    expect(withoutLineBreaks('  a\nb  ')).toBe('  a b  ')
    // 줄바꿈이 없으면 앞뒤 공백까지 그대로
    expect(withoutLineBreaks('  앞뒤 공백  ')).toBe('  앞뒤 공백  ')
  })

  it('withoutLineBreaks 는 아주 긴 공백도 한 번에 훑는다 (정규식 \\s*\\n\\s* 는 되짚기로 제곱 시간)', () => {
    const spaces = ' '.repeat(200_000)
    const started = performance.now()
    expect(withoutLineBreaks(`a${spaces}b\nc${spaces}`)).toBe(`a${spaces}b c${spaces}`)
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it.each([
    // [이름, 입력 전 값(저장돼 있던 값), 화면에서 읽은 값, 저장할 값, 커서]
    ['줄바꿈만 있는 값 앞에 한 글자', '\n', 'x\n', 'x\n', 1],
    ['줄바꿈만 있는 값 뒤에 한 글자', '\n', '\nx', '\nx', 2],
    ['가운데 · 끝 줄바꿈이 있는 값 가운데에 한 글자', '첫 줄\n둘째\n', '첫 줄\n둘째!\n', '첫 줄\n둘째!\n', 7],
    ['저장된 줄바꿈을 사용자가 지움', 'a\nb', 'ab', 'ab', 1],
    ['붙여 넣은 글(paste 에서 이미 줄바꿈을 뺀 글)', '위\n아래', '위붙인 글\n아래', '위붙인 글\n아래', 5],
    ['끌어다 놓은 글의 줄바꿈은 공백으로, 칸에 있던 줄바꿈은 그대로', '위\n아래', '위끌어\n놓기\n아래', '위끌어 놓기\n아래', 6],
    ['IME 가 넣은 Enter(끝): 줄바꿈도 공백도 남기지 않는다', '제목', '제목\n', '제목', 2],
    ['저장된 끝 줄바꿈 뒤에 들어온 Enter', '제목\n', '제목\n\n', '제목\n', 3],
    ['저장된 줄바꿈 옆에 들어온 줄바꿈', 'a\nb', 'a\n\nb', 'a\nb', 2],
    ['칸 전체를 줄바꿈이 든 글로 바꿈', '— 서명', '줄\n바꿈', '줄 바꿈', 4],
    ['바뀐 것 없음', 'a\nb', 'a\nb', 'a\nb', 3],
  ])('%s', (_, prev, next, value, caret) => {
    expect(singleLineInput(prev, next)).toEqual({ value, caret })
  })

  it('무작위 편집 3000개 (고정 시드): 새 글에 줄바꿈이 없으면 읽은 그대로, 있으면 그 줄바꿈만 빠지고 원래 있던 글자는 그대로', () => {
    const rand = seededRandom(20261126)
    const pool = ['a', 'b', '가', ' ', '\t', '\n', '\n']
    const text = (max: number) => Array.from({ length: Math.floor(rand() * (max + 1)) }, () => pool[Math.floor(rand() * pool.length)]).join('')
    const breaks = (value: string) => value.split('\n').length - 1
    const visible = (value: string) => value.replace(/\s/g, '')
    for (let n = 0; n < 3000; n++) {
      // 저장돼 있던 값의 [from, to) 를 새 글로 바꾼다 (입력 · 붙여넣기 · 끌어다 놓기 · 선택한 글 바꾸기)
      const prev = text(12)
      const from = Math.floor(rand() * (prev.length + 1))
      const to = from + Math.floor(rand() * (prev.length - from + 1))
      const inserted = text(6)
      const next = prev.slice(0, from) + inserted + prev.slice(to)
      const label = JSON.stringify({ prev, from, to, inserted })
      const { value, caret } = singleLineInput(prev, next)

      if (!inserted.includes('\n')) expect(value, label).toBe(next)
      // 줄바꿈은 원래 있던 것보다 늘지 않고, 고치지 않은 자리의 줄바꿈은 하나도 줄지 않는다
      expect(breaks(value), label).toBeLessThanOrEqual(breaks(prev))
      expect(breaks(value), label).toBeGreaterThanOrEqual(breaks(prev.slice(0, from)) + breaks(prev.slice(to)))
      // 줄바꿈 둘레의 공백 말고는 글자를 더하거나 빼지 않는다
      expect(visible(value), label).toBe(visible(next))
      expect(caret, label).toBeGreaterThanOrEqual(0)
      expect(caret, label).toBeLessThanOrEqual(value.length)
    }
  })
})

describe('writeValue → readValue 왕복 (저장 값이 그대로 다시 읽힌다)', () => {
  const values = ['', 'abc', '\n', '\n\n', '\n\nabc', 'abc\n', 'abc\n\n', '\n \n', '   ', ' \n', 'a\r\nb', 'a b', '<b>&', '끝  ']

  it.each(values.map((v) => [JSON.stringify(v), v]))('%s', (_, value) => {
    const el = document.createElement('div')
    writeValue(el, value)
    expect(readValue(el)).toBe(value)
    expect(el.textContent).toBe(displayText(value))
    // 빈 값일 때만 :empty (placeholder)
    expect(el.matches(':empty')).toBe(value === '')
  })

  it('displayText: 줄바꿈으로 끝나는 값만 \\n 을 하나 더 (마지막 빈 줄이 보이도록)', () => {
    expect(displayText('')).toBe('')
    expect(displayText('abc')).toBe('abc')
    expect(displayText('\n\n')).toBe('\n\n\n')
    expect(displayText('abc\n')).toBe('abc\n\n')
  })
})
