import { describe, expect, it } from 'vitest'
import type { HandoutContent } from './model'
import { escapeHtml, handoutDocumentHtml, handoutFileName, roll20Html, roll20Text, whitespaceHtml } from './roll20'
import { createHandoutContent, getTemplate, handoutTemplates } from './templates'

const NBSP = ' '

function withFields(content: HandoutContent, fields: Record<string, string>): HandoutContent {
  return { ...content, fields: { ...content.fields, ...fields } }
}

/** Roll20 은 <style>·<script>·class 를 버린다 — 인라인 스타일 표만 남아야 한다 */
function expectRoll20Safe(html: string) {
  const low = html.toLowerCase()
  expect(low).not.toContain('<style')
  expect(low).not.toContain('<script')
  expect(low).not.toMatch(/\sclass\s*=/)
  expect(low).not.toMatch(/\son[a-z]+\s*=/)
  expect(low).not.toContain('pre-wrap')
  expect(low.startsWith('<table')).toBe(true)
  // 모든 여는 태그(tbody/tr/br 제외)에 인라인 style 이 있다
  const tags = [...html.matchAll(/<([a-z]+)(\s[^>]*)?>/g)].filter(([, name]) => !['tbody', 'tr', 'br'].includes(name))
  for (const [tag] of tags) expect(tag).toMatch(/\sstyle="[^"]+"/)
}

describe('공백 · 이스케이프', () => {
  it('escapeHtml', () => {
    expect(escapeHtml(`<b>&"'`)).toBe('&lt;b&gt;&amp;&quot;&#39;')
  })

  it('줄 앞 공백 · 연속 공백 · 탭 · NBSP · 줄바꿈 보존', () => {
    expect(whitespaceHtml('X  Y')).toBe('X&nbsp; Y')
    expect(whitespaceHtml(`    들여쓴 줄\nA  B   C\n\t탭 줄`)).toBe(
      '&nbsp;&nbsp;&nbsp;&nbsp;들여쓴 줄<br>A&nbsp; B&nbsp;&nbsp; C<br>&nbsp;&nbsp;&nbsp;&nbsp;탭 줄',
    )
    expect(whitespaceHtml(`a${NBSP}${NBSP}b\r\nc`)).toBe('a&nbsp; b<br>c')
  })

  it('줄 끝 공백도 &nbsp; 로 남긴다 (회귀: 끝 공백이 접히던 문제)', () => {
    expect(whitespaceHtml('끝 ')).toBe('끝&nbsp;')
    expect(whitespaceHtml('끝   ')).toBe('끝&nbsp;&nbsp;&nbsp;')
    expect(whitespaceHtml('a b  \nc\t')).toBe('a b&nbsp;&nbsp;<br>c&nbsp;&nbsp;&nbsp;&nbsp;')
    expect(whitespaceHtml(`끝${NBSP}`)).toBe('끝&nbsp;')
  })

  it('공백만 있는 줄 · 빈 줄 보존, 줄 가운데 한 칸은 일반 공백(줄바꿈 가능)', () => {
    expect(whitespaceHtml('첫 줄\n   \n\n끝 줄')).toBe('첫 줄<br>&nbsp;&nbsp;&nbsp;<br><br>끝 줄')
    expect(whitespaceHtml('  ')).toBe('&nbsp;&nbsp;')
    expect(whitespaceHtml('a b c')).toBe('a b c')
    expect(whitespaceHtml('a  b')).toBe('a&nbsp; b')
  })

  it('HTML 을 렌더링하면 보이는 글자가 원래 글자와 같다 (공백 포함)', () => {
    for (const value of ['  들여쓰기  ', 'a  b   c ', '   ', '첫 줄 \n  \n끝\t', 'x']) {
      const div = document.createElement('div')
      div.innerHTML = whitespaceHtml(value)
      // <br> → \n, &nbsp; → 공백으로 되돌리면 정규화한 원문과 같아야 한다
      const shown = Array.from(div.childNodes)
        .map((n) => (n.nodeName === 'BR' ? '\n' : (n.textContent ?? '')))
        .join('')
        .split(NBSP)
        .join(' ')
      expect(shown).toBe(value.replace(/\t/g, '    '))
    }
  })
})

describe('공백만 있는 칸 (회귀)', () => {
  const base = createHandoutContent('moonlit')

  it('Roll20 HTML: 공백만 있는 선택 칸은 빼지 않고 &nbsp; 로 그린다 · 빈 문자열인 선택 칸만 뺀다', () => {
    const withSpaces = roll20Html(withFields(base, { signature: '   ', cap: '' }))
    expectRoll20Safe(withSpaces)
    expect(withSpaces).toMatch(/>&nbsp;&nbsp;&nbsp;<\/p>/)
    expect(withSpaces).not.toContain(base.fields.cap)

    const empty = roll20Html(withFields(base, { signature: '', cap: '' }))
    expect(empty).not.toMatch(/>&nbsp;&nbsp;&nbsp;<\/p>/)
    expect(empty.length).toBeLessThan(withSpaces.length)
  })

  it('Roll20 HTML: 필수 칸이 공백만이면 그 공백을, 빈 문자열이면 자리(&nbsp;)를 남긴다', () => {
    expect(roll20Html(withFields(base, { title: '  ' }))).toMatch(/>&nbsp;&nbsp;<\/p>/)
    expect(roll20Html(withFields(base, { title: '' }))).toMatch(/>&nbsp;<\/p>/)
  })

  it('평문: 공백만 있는 칸과 줄 끝 공백을 그대로, 빈 문자열인 칸만 뺀다', () => {
    const text = roll20Text(withFields(base, { cap: '   ', title: '제목  ', body: '본문\n   \n끝 ', signature: '' }))
    const rows = text.split('\n\n')
    expect(rows).toContain('   ')
    expect(text).toContain('제목  ')
    expect(text).toContain('본문\n   \n끝 ')
    expect(roll20Text(withFields(base, { cap: '' })).startsWith(base.fields.title)).toBe(true)
  })

  it('HTML 과 평문이 같은 칸을 넣고 뺀다', () => {
    const optional = getTemplate('moonlit').fields.filter((f) => f.optional)
    for (const value of ['', ' ', 'x']) {
      const fields = Object.fromEntries(optional.map((f) => [f.key, value]))
      const content = withFields(base, fields)
      const html = roll20Html(content)
      const text = roll20Text(content)
      const htmlHasSpaces = value === ' ' ? (html.match(/>&nbsp;<\/p>/g) ?? []).length : 0
      if (value === '') expect(text.split('\n\n')).not.toContain('')
      if (value === ' ') {
        expect(htmlHasSpaces).toBeGreaterThanOrEqual(optional.length)
        expect(text.split('\n\n').filter((r) => r === ' ')).toHaveLength(optional.length)
      }
      if (value === 'x') expect(text.split('\n\n').filter((r) => r === 'x')).toHaveLength(optional.length)
    }
  })
})

describe('줄바꿈만 있는 칸 · 줄바꿈으로 끝나는 칸 (회귀: 빈 줄이 사라지던 문제)', () => {
  const base = createHandoutContent('moonlit')
  const MARK = 'BODY-MARK'

  it('whitespaceHtml: 마지막 빈 줄은 &nbsp; 로 남겨 캔버스와 줄 수가 같다 (HTML 은 끝 <br> 뒤에 줄을 그리지 않음)', () => {
    expect(whitespaceHtml('\n')).toBe('<br>&nbsp;')
    expect(whitespaceHtml('\n\n')).toBe('<br><br>&nbsp;')
    expect(whitespaceHtml('본문\n')).toBe('본문<br>&nbsp;')
    expect(whitespaceHtml('\n\n본문')).toBe('<br><br>본문')
    expect(whitespaceHtml('a\r\n')).toBe('a<br>&nbsp;')
    expect(whitespaceHtml('a\n\nb')).toBe('a<br><br>b')
  })

  it('HTML 을 렌더링하면 줄 수가 값의 줄 수와 같다 (마지막 줄이 &nbsp; 로 남음)', () => {
    for (const value of ['\n', '\n\n', '본문\n', '\n\n본문', 'a\n\nb']) {
      const div = document.createElement('div')
      div.innerHTML = whitespaceHtml(value)
      // <br> 로 끝나지 않으므로 줄 수 = <br> 개수 + 1
      expect(div.lastChild?.nodeName).not.toBe('BR')
      expect(div.querySelectorAll('br').length + 1).toBe(value.split('\n').length)
    }
  })

  it.each(['\n', '\n\n', '\n\n본문', '본문\n', ' \n '])('Roll20 HTML · 평문: 본문 %j 를 빼거나 바꾸지 않는다', (body) => {
    const html = roll20Html(withFields(base, { body }))
    expectRoll20Safe(html)
    expect(html).toBe(roll20Html(withFields(base, { body: MARK })).replace(MARK, whitespaceHtml(body)))
    const text = roll20Text(withFields(base, { body }))
    expect(text).toBe(roll20Text(withFields(base, { body: MARK })).replace(MARK, body))
  })

  it('"\\n\\n" 본문: HTML 은 빈 줄 3개짜리 문단, 평문은 앞뒤 칸 사이에 빈 줄 3개를 그대로', () => {
    expect(roll20Html(withFields(base, { body: '\n\n' }))).toContain('"><br><br>&nbsp;</p>')
    const rows = roll20Text(withFields(base, { body: MARK })).split('\n\n')
    const i = rows.indexOf(MARK)
    expect(i).toBeGreaterThan(0)
    const text = roll20Text(withFields(base, { body: '\n\n' }))
    expect(text).toContain(`${rows[i - 1]}\n\n\n\n\n\n${rows[i + 1]}`)
  })
})

describe.each(handoutTemplates.map((t) => [t.id, t] as const))('Roll20 HTML — %s', (id, template) => {
  const base = createHandoutContent(id)

  it('표 기반 · 인라인 스타일만 · class/style/script 없음', () => {
    expectRoll20Safe(roll20Html(base))
  })

  it('사용자 글자를 이스케이프하고 공백을 보존한다', () => {
    const html = roll20Html(withFields(base, { title: '새로운 제목 <b>&', body: '첫 줄\n  둘째  줄\n\t셋째' }))
    expectRoll20Safe(html)
    expect(html).toContain('새로운 제목 &lt;b&gt;&amp;')
    expect(html).not.toContain('<b>&')
    expect(html).toContain('첫 줄<br>&nbsp;&nbsp;둘째&nbsp; 줄<br>&nbsp;&nbsp;&nbsp;&nbsp;셋째')
    expect(html).not.toContain('\t')
  })

  it('테마 색과 강조 색이 인라인으로 들어간다', () => {
    for (const theme of template.themes) {
      const html = roll20Html({ ...base, theme: theme.id })
      expect(html).toContain(`background-color:${theme.colors.paper}`)
      expect(html).toContain(theme.colors.ink)
    }
    const accented = roll20Html({ ...base, style: { accent: '#123abc' } })
    expect(accented).toContain('#123abc')
    expect(accented).not.toContain(template.themes[0].colors.accent)
  })

  it('글꼴 선택이 모든 글자에 적용된다', () => {
    const html = roll20Html({ ...base, style: { font: 'hand' } })
    expect(html).toContain('Segoe Print')
  })

  it('비어 있는 선택 칸은 빼고, 필수 칸은 자리를 남긴다', () => {
    const optional = template.fields.filter((f) => f.optional).map((f) => f.key)
    const emptied = Object.fromEntries(template.fields.map((f) => [f.key, '']))
    const html = roll20Html(withFields(base, emptied))
    expectRoll20Safe(html)
    for (const key of optional) expect(html).not.toContain(base.fields[key])
    expect(html).toContain('&nbsp;</p>')
  })

  it('이미지: https src · 인라인 width/max-width · alt 이스케이프', () => {
    const html = roll20Html({ ...base, image: { url: 'https://cdn.example.com/a.png?x=1&y="2"', alt: '지도 <1>' } })
    expectRoll20Safe(html)
    expect(html).toMatch(/<img src="https:\/\/cdn\.example\.com\/a\.png\?x=1&amp;y=&quot;2&quot;" alt="지도 &lt;1&gt;" width="\d+" style="[^"]*width:100%;max-width:\d+px;height:auto;/)
    expect(roll20Html(base)).not.toContain('<img')
  })

  it('평문(text/plain): 공백 정규화, 이스케이프 없음', () => {
    const text = roll20Text(withFields(base, { title: 'X  Y <b>&', body: `\t탭${NBSP}줄\r\n둘째` }))
    expect(text).toContain('X  Y <b>&')
    expect(text).toContain('    탭 줄\n둘째')
    expect(text).not.toContain('\t')
    expect(text).not.toContain(NBSP)
    expect(text).not.toContain('&lt;')
  })
})

describe('템플릿별 장식', () => {
  it('달빛의 초대: 맺음말과 꽃 장식, 목업의 양피지 색', () => {
    const html = roll20Html(createHandoutContent('moonlit'))
    expect(html).toContain('THE END OF THE LETTER')
    expect(html).toContain('❧')
    expect(html).toContain('#e8ddc9')
  })

  it('오래된 조사 기록: 서류 머리칸(이름표 + 값)과 기밀 도장', () => {
    const html = roll20Html(createHandoutContent('casefile'))
    expect(html).toContain('사건 번호')
    expect(html).toContain('№ 1927-0413')
    expect(html).toContain('CONFIDENTIAL')
    expect(html).toContain('border:2px solid #9b3b2f')
    expect(roll20Text(createHandoutContent('casefile'))).toContain('사건 번호: № 1927-0413')
  })

  it('비밀 결사의 인장: 원형 인장 칸', () => {
    const html = roll20Html(createHandoutContent('order'))
    expect(html).toMatch(/<td width="76" height="76"[^>]*border-radius:50%[^>]*>✠<\/td>/)
  })

  it('숲의 기록: 본문 왼쪽 세로 막대', () => {
    const html = roll20Html(createHandoutContent('forest'))
    expect(html).toMatch(/<td width="3" bgcolor="#5f7f4f"/)
  })
})

describe('HTML 파일 저장', () => {
  it('단독 문서: doctype · 제목 이스케이프 · 같은 Roll20 마크업', () => {
    const content = createHandoutContent('moonlit')
    const doc = handoutDocumentHtml(content, '달빛 <초대>')
    expect(doc.startsWith('<!doctype html>')).toBe(true)
    expect(doc).toContain('<title>달빛 &lt;초대&gt;</title>')
    expect(doc).toContain(roll20Html(content))
    expect(doc.toLowerCase()).not.toContain('<style')
  })

  it('파일 이름', () => {
    expect(handoutFileName('달빛: 초대/장?')).toBe('달빛 초대장.html')
    expect(handoutFileName('  ')).toBe('orarchive-handout.html')
    expect(getTemplate('moonlit').width).toBe(430)
  })
})
