import { describe, expect, it } from 'vitest'
import {
  MAX_ALT_LENGTH,
  normalizeHex,
  oversizedFields,
  parseHandoutContent,
  RECOMMENDED_FIELD_LENGTH,
  serializeHandout,
  validateImageUrl,
} from './model'
import { setField, switchTemplate } from './edits'
import { roll20Html, roll20Text } from './roll20'
import { createHandoutContent, getTemplate, handoutTemplates, newHandoutDocument, readHandout, resolveHandout, resolveLook } from './templates'

describe('parseHandoutContent (저장된 content 읽기 · 이전 형식 이전)', () => {
  it('빈 {} 는 기본 템플릿 · 빈 필드 · legacy', () => {
    const { content, legacy } = parseHandoutContent({})
    expect(legacy).toBe(true)
    expect(content).toEqual({ v: 1, templateId: 'moonlit', theme: '', fields: {}, style: {}, image: null })
  })

  it('Phase 1 의 { text } 는 본문으로 옮긴다', () => {
    const { content, legacy } = parseHandoutContent({ text: '첫 줄\n둘째 줄' })
    expect(legacy).toBe(true)
    expect(content.fields).toEqual({ body: '첫 줄\n둘째 줄' })
  })

  it('리뷰 회귀: Phase 1 의 빈 본문 { text: "" } 도 본문으로 옮긴다 (빈 문자열을 "없음"으로 보지 않는다)', () => {
    const { content, legacy } = parseHandoutContent({ text: '' })
    expect(legacy).toBe(true)
    expect(content.fields).toEqual({ body: '' })
  })

  it('null · 배열 · 숫자 같은 엉뚱한 값에도 예외 없이 기본값', () => {
    for (const raw of [null, undefined, [], 3, 'x', { fields: 'nope', style: [], image: 'x' }]) {
      expect(() => parseHandoutContent(raw as never)).not.toThrow()
      expect(parseHandoutContent(raw as never).content.templateId).toBe('moonlit')
    }
  })

  it('형식이 맞는 값은 그대로, 잘못된 값(색·글꼴·이미지·필드)은 버린다', () => {
    const { content, legacy } = parseHandoutContent({
      v: 1,
      templateId: 'order',
      theme: 'crimson',
      fields: { title: '봉인', body: 3, 'bad key': 'x', seal: '✠' },
      style: { accent: 'red', font: 'comic' },
      image: { url: 'http://insecure.example.com/a.png', alt: 'a' },
      text: '무시됨',
    })
    expect(legacy).toBe(false)
    expect(content.templateId).toBe('order')
    expect(content.theme).toBe('crimson')
    expect(content.fields).toEqual({ title: '봉인', seal: '✠' })
    expect(content.style).toEqual({})
    expect(content.image).toBeNull()
  })

  it('알 수 없는 templateId 는 기본 템플릿, 유효한 색·글꼴·이미지는 정규화해 남긴다', () => {
    const { content } = parseHandoutContent({
      templateId: 'nope',
      fields: {},
      style: { accent: '#ABC', font: 'hand' },
      image: { url: ' https://cdn.example.com/map.png ', alt: '지도' },
    })
    expect(content.templateId).toBe('moonlit')
    expect(content.style).toEqual({ accent: '#aabbcc', font: 'hand' })
    expect(content.image).toEqual({ url: 'https://cdn.example.com/map.png', alt: '지도' })
  })

  it('20,000자를 넘는 Phase 1 본문도 자르지 않고 옮기고, serialize → parse 에도 그대로 (회귀)', () => {
    const long = `${'가나다라 마바사\n  아자차  '.repeat(3000)}끝  `
    expect(long.length).toBeGreaterThan(RECOMMENDED_FIELD_LENGTH)
    const { content, legacy } = parseHandoutContent({ text: long })
    expect(legacy).toBe(true)
    expect(content.fields.body).toBe(long)

    const migrated = readHandout({ text: long })
    expect(migrated.fields.body).toBe(long)
    const saved = serializeHandout(migrated)
    expect((saved.fields as Record<string, string>).body).toBe(long)
    const reread = readHandout(saved)
    expect(reread.fields.body).toBe(long)
    expect(reread).toEqual(migrated)
  })

  it('저장된 핸드아웃의 긴 칸 · 긴 대체 텍스트도 읽을 때 자르지 않는다', () => {
    const long = 'x'.repeat(RECOMMENDED_FIELD_LENGTH + 5)
    const alt = '설'.repeat(MAX_ALT_LENGTH + 10)
    const { content } = parseHandoutContent({
      templateId: 'moonlit',
      fields: { title: long, body: long },
      image: { url: 'https://cdn.example.com/a.png', alt },
    })
    expect(content.fields.title).toBe(long)
    expect(content.fields.body).toBe(long)
    expect(content.image?.alt).toBe(alt)
  })

  it('oversizedFields: 권장 한도를 넘는 칸만 (내용은 바꾸지 않음)', () => {
    const base = createHandoutContent('moonlit')
    expect(oversizedFields(base)).toEqual([])
    const body = 'a'.repeat(RECOMMENDED_FIELD_LENGTH + 1)
    const content = { ...base, fields: { ...base.fields, body, title: 'b'.repeat(RECOMMENDED_FIELD_LENGTH) } }
    expect(oversizedFields(content)).toEqual([{ key: 'body', length: RECOMMENDED_FIELD_LENGTH + 1 }])
    expect(content.fields.body).toBe(body)
  })

  it('serialize → parse 왕복', () => {
    const original = { ...createHandoutContent('casefile'), style: { accent: '#123456' }, image: { url: 'https://a.example/x.png', alt: '' } }
    const { content, legacy } = parseHandoutContent(serializeHandout(original))
    expect(legacy).toBe(false)
    expect(content).toEqual(original)
  })
})

describe('readHandout (템플릿에 맞추기)', () => {
  it('legacy 내용은 템플릿 기본 문구로 빈 칸을 채우고, 옮겨 온 본문은 유지', () => {
    const content = readHandout({ text: '예전 본문' })
    expect(content.fields.body).toBe('예전 본문')
    expect(content.fields.title).toBe(getTemplate('moonlit').fields.find((f) => f.key === 'title')?.defaultText)
    expect(content.theme).toBe('classic')
  })

  it('리뷰 회귀: legacy 의 빈 본문("")은 빈 칸으로 — 기본 문구는 저장된 적 없는 칸(머리 문구 · 제목 · 서명)에만', () => {
    const defaults = Object.fromEntries(getTemplate('moonlit').fields.map((f) => [f.key, f.defaultText]))
    expect(readHandout({ text: '' }).fields).toEqual({ ...defaults, body: '' })
    // 공백 · 줄바꿈만 있는 이전 본문도 그대로
    expect(readHandout({ text: ' \n ' }).fields.body).toBe(' \n ')
    // 문자열이 아닌 text 는 저장된 본문이 아니다 (저장된 적 없는 칸 → 기본 문구)
    expect(readHandout({ text: 5 }).fields.body).toBe(defaults.body)
  })

  it('템플릿에 없는 테마는 첫 테마로', () => {
    expect(readHandout({ templateId: 'forest', theme: 'classic', fields: {} }).theme).toBe('moss')
  })

  it('저장된 핸드아웃의 빈 칸은 기본 문구로 채우지 않는다 (사용자가 지운 것)', () => {
    expect(readHandout({ templateId: 'moonlit', fields: { title: '' } }).fields.title).toBe('')
  })
})

describe('템플릿', () => {
  it('4개 템플릿, 각자 고유한 필드·테마·블록', () => {
    expect(handoutTemplates.map((t) => t.id)).toEqual(['moonlit', 'casefile', 'order', 'forest'])
    expect(handoutTemplates.map((t) => t.name)).toEqual(['달빛의 초대', '오래된 조사 기록', '비밀 결사의 인장', '숲의 기록'])
    for (const t of handoutTemplates) {
      expect(t.fields.some((f) => f.key === 'title')).toBe(true)
      expect(t.fields.find((f) => f.key === 'body')?.multiline).toBe(true)
      expect(t.themes.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('newHandoutDocument: 템플릿 기본 제목과 저장용 content', () => {
    const doc = newHandoutDocument('casefile')
    expect(doc.title).toBe('아컴 부두 실종 사건')
    expect(doc.content).toMatchObject({ v: 1, templateId: 'casefile', theme: 'manila' })
  })

  it('템플릿을 바꾸면 두 템플릿에 모두 있는 필드는 유지, 새 필드는 기본 문구, 새 템플릿에 없는 필드도 지우지 않는다', () => {
    const start = createHandoutContent('moonlit')
    const stored = serializeHandout({
      ...start,
      style: { accent: '#112233' },
      fields: { ...start.fields, title: '내 제목', body: '내 본문', cap: '내 머리말', signature: '내 서명' },
    })
    const next = switchTemplate(stored, 'casefile')
    const view = resolveHandout(next)
    expect(view.templateId).toBe('casefile')
    expect(view.fields).toMatchObject({ title: '내 제목', body: '내 본문', cap: '내 머리말', signature: '내 서명' })
    expect(view.fields.caseNo).toBe('№ 1927-0413')
    // 저장된 테마('classic')는 바꾸지 않는다 — 조사 기록에는 없는 테마라 화면 · 출력은 첫 테마로 그린다
    expect(next.theme).toBe('classic')
    expect(view.theme).toBe('manila')
    expect(view.style.accent).toBe('#112233')

    const forest = switchTemplate(setField(setField(next, 'date', '1927년 봄'), 'caseNo', '№ 내 번호'), 'forest')
    const forestView = resolveHandout(forest)
    expect(forestView.fields.date).toBe('1927년 봄')
    // 숲의 기록에는 없는 칸이지만 사용자가 쓴 글이므로 남겨 둔다 (화면 · 출력에는 쓰지 않음)
    expect(forestView.fields.caseNo).toBe('№ 내 번호')
    expect(roll20Html(forestView)).not.toContain('№ 내 번호')
    expect(roll20Text(forestView)).not.toContain('№ 내 번호')
    // 돌아오면 다시 보인다 (기본 문구로 덮어쓰지 않음)
    expect(resolveHandout(switchTemplate(forest, 'casefile')).fields.caseNo).toBe('№ 내 번호')
  })

  it('resolveLook: 강조 색과 글꼴을 테마 위에 얹는다', () => {
    const look = resolveLook({ ...createHandoutContent('order'), style: { accent: '#ff0000', font: 'sans' } })
    expect(look.colors.accent).toBe('#ff0000')
    expect(look.colors.paper).toBe('#191b21')
    expect(look.font).toBe('sans')
    expect(look.fontStack).toContain('Malgun Gothic')
  })
})

describe('입력 검사', () => {
  it('normalizeHex', () => {
    expect(normalizeHex('#9B3B2F')).toBe('#9b3b2f')
    expect(normalizeHex('abc')).toBe('#aabbcc')
    expect(normalizeHex(' #123456 ')).toBe('#123456')
    for (const bad of ['', '#12345', 'red', '#ggg', 'url(x)', '#1234567', null]) expect(normalizeHex(bad)).toBeNull()
  })

  it.each([
    ['https://cdn.example.com/a.png', true],
    ['  https://i.imgur.com/x.jpg?size=2  ', true],
    ['http://example.com/a.png', false],
    ['javascript:alert(1)', false],
    ['data:image/png;base64,AAAA', false],
    ['//example.com/a.png', false],
    ['https://user:pw@example.com/a.png', false],
    ['https://localhost/a.png', false],
    ['그냥 글자', false],
    ['', false],
  ])('validateImageUrl(%s) → %s', (url, ok) => {
    const result = validateImageUrl(url)
    expect(result.ok).toBe(ok)
    if (!result.ok) expect(result.error).toMatch(/[가-힣]/)
  })
})
