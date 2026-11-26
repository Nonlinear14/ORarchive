import { describe, expect, it } from 'vitest'
import type { DocumentContent } from '../../lib/documents'
import { randomCorpus, storedCorpus, type StoredCase } from '../../test/handoutCorpus'
import { changedPaths, deepFreeze } from '../../test/json'
import { removeImage, setAccent, setField, setFont, setImage, setTheme, switchTemplate, type HandoutEdit } from './edits'
import { isStructuredHandout, serializeHandout, templateIds, type HandoutContent, type HandoutStyle } from './model'
import { escapeHtml, roll20Html, roll20Text } from './roll20'
import { getTemplate, handoutTemplates, resolveHandout, themeOf } from './templates'

type Stored = Record<string, unknown>

const isPlainObject = (value: unknown): value is Stored => typeof value === 'object' && value !== null && !Array.isArray(value)
const has = (value: unknown, key: string) => isPlainObject(value) && Object.hasOwn(value, key)
const at = (value: unknown, key: string): unknown => (isPlainObject(value) ? value[key] : undefined)
const stored = (value: unknown) => value as DocumentContent

/** 고친 값의 자리: 그 자리(container)가 객체면 그 안의 키들, 객체가 아니면(없음 · 쓸 수 없는 값) 자리 전체 */
function inside(before: Stored, container: string, keys: string[]): string[] {
  return isPlainObject(before[container]) ? keys.map((key) => `${container}.${key}`) : [container]
}

/** legacy content 의 첫 편집: 핸드아웃 형식으로 옮기며 fields 를 적고, 없던 v · templateId 를 더한다 */
function migrationPaths(before: Stored): string[] {
  if (isStructuredHandout(stored(before))) return []
  return ['fields', ...(has(before, 'templateId') ? [] : ['templateId']), ...(has(before, 'v') ? [] : ['v'])]
}

function withoutAccent(style: HandoutStyle): HandoutStyle {
  const rest = { ...style }
  delete rest.accent
  return rest
}

interface EditCase {
  name: string
  edit: HandoutEdit
  /** 바뀌어도 되는 저장 경로 — 이 밖의 저장 값은 한 글자도 바뀌면 안 된다 */
  paths(before: Stored): string[]
  /** 고친 뒤의 보기: 고치기 전 보기에 고친 것만 반영한 것 (보이는 다른 것은 그대로) */
  view(before: Stored, shown: HandoutContent): HandoutContent
  /** [저장된 값, 기대 값]: 고친 값이 들어갔는가 */
  written(after: Stored): [unknown, unknown]
}

const BODY = '고친 본문 \n  둘째 줄'
const NEW_URL = 'https://cdn.example.com/new.png'

function editCases(shown: HandoutContent): EditCase[] {
  const theme = getTemplate(shown.templateId).themes[1].id
  return [
    {
      name: '본문',
      edit: (s) => setField(s, 'body', BODY),
      paths: (b) => inside(b, 'fields', ['body']),
      view: (_, v) => ({ ...v, fields: { ...v.fields, body: BODY } }),
      written: (a) => [at(a.fields, 'body'), BODY],
    },
    {
      name: '제목',
      edit: (s) => setField(s, 'title', '새 제목'),
      paths: (b) => inside(b, 'fields', ['title']),
      view: (_, v) => ({ ...v, fields: { ...v.fields, title: '새 제목' } }),
      written: (a) => [at(a.fields, 'title'), '새 제목'],
    },
    {
      name: '테마',
      edit: (s) => setTheme(s, theme),
      paths: () => ['theme'],
      view: (_, v) => ({ ...v, theme }),
      written: (a) => [a.theme, theme],
    },
    {
      name: '글꼴',
      edit: (s) => setFont(s, 'sans'),
      paths: (b) => inside(b, 'style', ['font']),
      view: (_, v) => ({ ...v, style: { ...v.style, font: 'sans' } }),
      written: (a) => [at(a.style, 'font'), 'sans'],
    },
    {
      name: '강조 색',
      edit: (s) => setAccent(s, '#123456'),
      paths: (b) => inside(b, 'style', ['accent']),
      view: (_, v) => ({ ...v, style: { ...v.style, accent: '#123456' } }),
      written: (a) => [at(a.style, 'accent'), '#123456'],
    },
    {
      name: '강조 색 → 테마 기본값',
      edit: (s) => setAccent(s, undefined),
      paths: (b) => (has(b.style, 'accent') ? ['style.accent'] : []),
      view: (_, v) => ({ ...v, style: withoutAccent(v.style) }),
      written: (a) => [has(a.style, 'accent'), false],
    },
    {
      name: '이미지 넣기',
      edit: (s) => setImage(s, { url: NEW_URL, alt: '새 이미지' }),
      paths: (b) => inside(b, 'image', ['url', 'alt']),
      view: (_, v) => ({ ...v, image: { url: NEW_URL, alt: '새 이미지' } }),
      written: (a) => [[at(a.image, 'url'), at(a.image, 'alt')], [NEW_URL, '새 이미지']],
    },
    {
      name: '대체 텍스트만',
      edit: (s) => setImage(s, { alt: '새 대체' }),
      paths: (b) => inside(b, 'image', ['alt']),
      // 저장된 주소를 쓸 수 없으면 대체 텍스트만 바꿔도 이미지는 여전히 그리지 않는다
      view: (_, v) => ({ ...v, image: v.image && { ...v.image, alt: '새 대체' } }),
      written: (a) => [at(a.image, 'alt'), '새 대체'],
    },
    {
      name: '주소만',
      edit: (s) => setImage(s, { url: NEW_URL }),
      paths: (b) => inside(b, 'image', ['url']),
      view: (b, v) => {
        const alt = at(b.image, 'alt')
        return { ...v, image: { url: NEW_URL, alt: typeof alt === 'string' ? alt : '' } }
      },
      written: (a) => [at(a.image, 'url'), NEW_URL],
    },
    {
      name: '이미지 빼기',
      edit: removeImage,
      paths: () => ['image'],
      view: (_, v) => ({ ...v, image: null }),
      written: (a) => [a.image, null],
    },
    ...templateIds.map(
      (id): EditCase => ({
        name: `템플릿 → ${id}`,
        edit: (s) => switchTemplate(s, id),
        // 저장된 적 없는 칸만 더한다 (있던 칸은 쓸 수 없는 값이라도 그대로)
        paths: (b) => {
          const fields = b.fields
          if (!isPlainObject(fields)) return ['templateId', 'fields']
          return ['templateId', ...getTemplate(id).fields.filter((f) => !Object.hasOwn(fields, f.key)).map((f) => `fields.${f.key}`)]
        },
        view: (b, v) => {
          const template = getTemplate(id)
          // 저장된 칸 (legacy 는 첫 편집 때 옮겨 적는, 보이던 칸)
          const fields = isStructuredHandout(stored(b)) ? (isPlainObject(b.fields) ? b.fields : {}) : v.fields
          const added = template.fields.filter((f) => !Object.hasOwn(fields, f.key)).map((f) => [f.key, f.defaultText])
          // 저장된 테마는 그대로 — 새 템플릿에 없으면 첫 테마로 그린다
          const theme = themeOf(template, typeof b.theme === 'string' ? b.theme : '').id
          return { ...v, templateId: id, theme, fields: { ...v.fields, ...Object.fromEntries(added) } }
        },
        written: (a) => [a.templateId, id],
      }),
    ),
  ]
}

/** 모든 편집에 대해: 원본은 그대로 · 고친 경로 밖의 저장 값은 한 글자도 그대로 · 고친 값이 들어감 · 보이는 것은 고친 것만 바뀜 */
function expectOnlyEditedPathsChange({ name, content }: StoredCase) {
  const before = deepFreeze(structuredClone(content)) as Stored
  const snapshot = JSON.stringify(before)
  const shown = resolveHandout(stored(before))
  for (const op of editCases(shown)) {
    const label = `${name} / ${op.name}`
    const after = op.edit(stored(before)) as Stored
    expect(JSON.stringify(before), `${label}: 원본이 바뀜`).toBe(snapshot)
    const allowed = new Set([...migrationPaths(before), ...op.paths(before)])
    expect(
      changedPaths(before, after).filter((path) => !allowed.has(path)),
      `${label}: 고치지 않은 저장 값이 바뀜`,
    ).toEqual([])
    const [actual, expected] = op.written(after)
    expect(actual, `${label}: 고친 값`).toEqual(expected)
    expect(isStructuredHandout(stored(after)), `${label}: 핸드아웃 형식`).toBe(true)
    expect(resolveHandout(stored(after)), `${label}: 보기`).toEqual(op.view(before, shown))
  }
}

describe('저장된 content 편집 — 고친 경로만 바뀐다 (속성 테스트)', () => {
  it.each(storedCorpus.map((c) => [c.name, c] as const))('%s', (_, c) => expectOnlyEditedPathsChange(c))

  it('무작위 저장 content 400개 (고정 시드): 모든 편집이 고친 경로만 바꾼다', () => {
    for (const c of randomCorpus(400)) expectOnlyEditedPathsChange(c)
  })

  it('말뭉치는 정규화를 잡아낸다: 예전 방식(보기를 직렬화해 저장)은 이미 정규형인 한 경우 말고는 모두 고치지 않은 저장 값을 바꾼다', () => {
    const unchanged = storedCorpus.filter(({ content }) => changedPaths(content, serializeHandout(resolveHandout(content))).length === 0)
    expect(unchanged.map((c) => c.name)).toEqual(['숨은 칸(다른 템플릿에만 있는 칸) · 아주 긴 칸'])
  })
})

describe('저장된 content 편집 — 예시', () => {
  it('리뷰 회귀: 저장된 #ABC · 대문자 호스트는 본문 · 테마 · 글꼴을 고쳐도 그대로, 보기에서만 정규화', () => {
    const before = deepFreeze({
      v: 1,
      templateId: 'moonlit',
      theme: 'classic',
      fields: { title: '제목', body: '본문' },
      style: { accent: '#ABC' },
      image: { url: 'https://EXAMPLE.com/map.png', alt: '지도' },
    })
    for (const after of [setField(before, 'body', '새 본문'), setTheme(before, 'dark'), setFont(before, 'hand')]) {
      // 고치지 않은 자리는 같은 객체 그대로
      expect(after.image).toBe(before.image)
      expect(after).toMatchObject({ style: { accent: '#ABC' }, image: { url: 'https://EXAMPLE.com/map.png' } })
      const view = resolveHandout(after)
      expect(view.style.accent).toBe('#aabbcc')
      expect(view.image?.url).toBe('https://example.com/map.png')
    }
  })

  it('Phase 1 { text }: 첫 편집 때 핸드아웃 형식으로 옮긴다 — text 는 그대로 남고, 보이던 글은 한 글자도 바뀌지 않고 fields 로', () => {
    const text = '예전 본문\n  들여쓴 줄  \n\n끝 '
    const before = deepFreeze({ text, note: { from: 'phase1' } })
    const shown = resolveHandout(before)
    const after = setField(before, 'title', '새 제목')
    expect(after).toEqual({
      text,
      note: { from: 'phase1' },
      v: 1,
      templateId: 'moonlit',
      fields: { ...shown.fields, title: '새 제목' },
    })
    expect((after.fields as Record<string, string>).body).toBe(text)
    expect(resolveHandout(after)).toEqual({ ...shown, fields: { ...shown.fields, title: '새 제목' } })
    // 그 뒤의 편집은 핸드아웃 형식 content 에 고친 경로만
    expect(changedPaths(after, setTheme(after, 'dark'))).toEqual(['theme'])
  })

  /** 보기의 Roll20 HTML · 평문에 lines 의 어느 줄도 없다 */
  function expectNotExported(view: HandoutContent, lines: string[], label: string) {
    const html = roll20Html(view)
    const text = roll20Text(view)
    for (const line of lines) {
      expect(html, `${label}: HTML 에 「${line}」`).not.toContain(escapeHtml(line))
      expect(text, `${label}: 평문에 「${line}」`).not.toContain(line)
    }
  }
  const defaultLines = (keys: string[]) =>
    handoutTemplates.flatMap((t) => t.fields.filter((f) => keys.includes(f.key)).flatMap((f) => f.defaultText.split('\n'))).filter(Boolean)

  it('리뷰 회귀: Phase 1 의 빈 본문 { text: "" } — 어떤 편집으로 옮겨도 body 는 "" (기본 본문을 지어 넣지 않음) · 출력에 기본 본문이 없다', () => {
    const before = deepFreeze({ text: '' })
    const bodies = defaultLines(['body'])
    expect(resolveHandout(before).fields.body).toBe('')
    expectNotExported(resolveHandout(before), bodies, '열었을 때')
    const edits: [string, DocumentContent][] = [
      ['제목', setField(before, 'title', '새 제목')],
      ['테마', setTheme(before, 'dark')],
      ['글꼴', setFont(before, 'sans')],
      ['강조 색', setAccent(before, '#123456')],
      ['이미지 넣기', setImage(before, { url: NEW_URL, alt: '' })],
      ['이미지 빼기', removeImage(before)],
      ...templateIds.map((id): [string, DocumentContent] => [`템플릿 → ${id}`, switchTemplate(before, id)]),
    ]
    for (const [label, after] of edits) {
      expect(after.text, label).toBe('')
      expect(at(after.fields, 'body'), label).toBe('')
      const view = resolveHandout(after)
      expect(view.fields.body, label).toBe('')
      expectNotExported(view, bodies, label)
    }
  })

  it.each(templateIds)('리뷰 회귀: 사용자가 비운 칸("")은 다른 편집 · 다른 템플릿에 다녀온 뒤에도 "" — 기본 문구로 채우지 않는다 (%s)', (id) => {
    const template = getTemplate(id)
    const emptied = Object.fromEntries(template.fields.map((f) => [f.key, '']))
    const before = deepFreeze({
      v: 1,
      templateId: id,
      theme: template.themes[0].id,
      fields: emptied,
      style: {},
      image: { url: 'https://cdn.example.com/a.png', alt: '' },
    })
    const roundTrip = [...templateIds.filter((other) => other !== id), id].reduce<DocumentContent>(switchTemplate, before)
    const edits: [string, DocumentContent][] = [
      ['제목', setField(before, 'title', '새 제목')],
      ['테마', setTheme(before, template.themes[1].id)],
      ['글꼴', setFont(before, 'hand')],
      ['강조 색', setAccent(before, '#123456')],
      ['주소만', setImage(before, { url: NEW_URL })],
      ['다른 템플릿을 모두 거쳐 돌아옴', roundTrip],
    ]
    const keys = template.fields.map((f) => f.key)
    for (const [label, after] of edits) {
      const view = resolveHandout(after)
      for (const key of keys) {
        if (label === '제목' && key === 'title') continue
        expect(at(after.fields, key), `${label}: 저장된 ${key}`).toBe('')
        expect(view.fields[key], `${label}: 보이는 ${key}`).toBe('')
      }
      expect(at(after.image, 'alt'), label).toBe('')
      expect(view.image?.alt, label).toBe('')
      // 빈 선택 칸은 출력에서 빠지고, 빈 칸 어디에도 기본 문구가 들어가지 않는다
      expectNotExported(view, defaultLines(keys), label)
    }
  })

  it('있던 v · templateId 는 쓸 수 없는 값이라도 옮길 때 그대로 둔다', () => {
    const after = setField({ text: '본문', templateId: 'nope', v: 3 }, 'title', 't')
    expect(after).toMatchObject({ templateId: 'nope', v: 3, text: '본문', fields: { body: '본문', title: 't' } })
    expect(resolveHandout(after).templateId).toBe('moonlit')
  })

  it('JSON 에서 읽은 __proto__ 키는 자기 키로 그대로 남고, 프로토타입은 바뀌지 않는다', () => {
    const before = JSON.parse('{"templateId":"moonlit","fields":{"__proto__":"칸","title":"t"},"style":{"__proto__":{"accent":"#000000"}}}')
    const after = setAccent(setField(before, 'body', 'b'), '#123456') as Stored
    expect(Object.getPrototypeOf(after)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(after.fields)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(after.style)).toBe(Object.prototype)
    expect(JSON.stringify(after)).toBe(
      '{"templateId":"moonlit","fields":{"__proto__":"칸","title":"t","body":"b"},"style":{"__proto__":{"accent":"#000000"},"accent":"#123456"}}',
    )
  })

  it('강조 색을 테마 기본값으로: 저장된 accent 키만 빼고 style 의 다른 키는 그대로, accent 가 없으면 아무것도 바꾸지 않는다', () => {
    const before = deepFreeze({ templateId: 'order', fields: {}, style: { accent: '#ABC', font: 'hand', weight: 'bold' } })
    expect(setAccent(before, undefined)).toEqual({ templateId: 'order', fields: {}, style: { font: 'hand', weight: 'bold' } })
    const without = deepFreeze({ templateId: 'order', fields: {}, style: { font: 'hand' } })
    expect(setAccent(without, undefined)).toBe(without)
  })

  it('고친 값이 들어갈 자리가 객체가 아니면 그 자리만 새 객체가 된다 (다른 값은 그대로)', () => {
    const before = deepFreeze({ v: 1, templateId: 'order', fields: 'nope', style: ['x'], image: 'a', extra: 1 })
    expect(changedPaths(before, setField(before, 'body', 'b'))).toEqual(['fields'])
    expect(changedPaths(before, setFont(before, 'sans'))).toEqual(['style'])
    expect(changedPaths(before, setImage(before, { alt: 'x' }))).toEqual(['image'])
    expect(setFont(before, 'sans').style).toEqual({ font: 'sans' })
  })

  it('템플릿 바꾸기: 저장된 적 없는 칸만 기본 문구로 더하고, 있던 칸은 쓸 수 없는 값이라도 덮어쓰지 않는다', () => {
    const before = deepFreeze({ v: 1, templateId: 'moonlit', theme: 'dark', fields: { title: 't', caseNo: null } })
    const after = switchTemplate(before, 'casefile')
    expect(changedPaths(before, after)).toEqual(['fields.agent', 'fields.body', 'fields.cap', 'fields.date', 'fields.signature', 'templateId'])
    expect(after).toMatchObject({ theme: 'dark', fields: { caseNo: null } })
    expect(resolveHandout(after).theme).toBe('manila')
    expect(resolveHandout(switchTemplate(after, 'moonlit')).theme).toBe('dark')
  })
})
