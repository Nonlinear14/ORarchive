import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentContent } from '../../../lib/documents'
import { createFakeSupabase } from '../../../test/fakeSupabase'
import { changedPaths, deepFreeze } from '../../../test/json'
import { renderApp } from '../../../test/renderApp'
import { escapeHtml } from '../roll20'
import { getTemplate, handoutTemplates } from '../templates'

/*
 * 스튜디오에서 값 하나를 고치면 저장되는 content 에서 그 경로만 바뀐다.
 * 고치지 않은 저장 값은 정규화(대소문자 · 공백 · 주소 형식)되거나 빠지지(알 수 없는 키 · 잘못된 값 · 숨은 칸) 않고
 * 한 글자도 바뀌지 않는다. 화면과 Roll20 출력에는 검사 · 정규화한 값만 쓴다.
 */

afterEach(() => {
  vi.useRealTimers()
})

type Stored = { [key: string]: unknown }

const field = (key: string) => document.querySelector<HTMLElement>(`[data-hfield="${key}"]`)!
const canvas = () => document.querySelector<HTMLElement>('.hc-canvas')!
const accentInput = () => screen.getByLabelText('강조 색 직접 입력 (hex)')
const urlInput = () => screen.getByLabelText('이미지 주소 (https)')
const altInput = () => screen.getByLabelText('대체 텍스트')

function typeInto(el: HTMLElement, text: string) {
  el.textContent = text
  fireEvent.input(el)
}

async function openStudio(content: Stored) {
  const fake = createFakeSupabase()
  // 저장된 원본은 얼려 둔다 — 어디서든 원본을 고치면(strict mode) 바로 오류가 난다
  const row = fake.control.insertDocument({
    type: 'handout',
    title: '저장 값 보존',
    content: deepFreeze(structuredClone(content)) as DocumentContent,
  })
  renderApp(`/studio/handout/${row.id}`, { client: fake.client })
  await screen.findByRole('group', { name: '핸드아웃 캔버스' })
  vi.useFakeTimers()
  const saved = () => fake.control.tables.documents.find((d) => d.id === row.id)!.content as Stored
  const updates = () => fake.control.calls.filter((c) => c.op === 'update').length
  /** 자동 저장 대기 시간을 넘긴다 */
  const settle = () => act(() => vi.advanceTimersByTimeAsync(800))
  return { saved, updates, settle }
}

function roll20Code(): string {
  fireEvent.click(screen.getByRole('button', { name: 'HTML 코드 보기' }))
  const dialog = screen.getByRole('dialog', { name: 'HTML 코드 보기' })
  const code = (within(dialog).getByLabelText('HTML 코드') as HTMLTextAreaElement).value
  fireEvent.click(within(dialog).getByRole('button', { name: '확인' }))
  return code
}

/** "Roll20에 복사" 가 클립보드에 쓰는 text/html · text/plain (실제 타이머로 바꿔 복사 토스트까지 기다린다) */
async function copiedForRoll20(): Promise<{ html: string; text: string }> {
  vi.useRealTimers()
  const written: Record<string, Blob>[] = []
  Object.defineProperty(navigator, 'clipboard', {
    value: { write: (items: { parts: Record<string, Blob> }[]) => (written.push(items[0].parts), Promise.resolve()) },
    configurable: true,
  })
  vi.stubGlobal(
    'ClipboardItem',
    class {
      readonly parts: Record<string, Blob>
      constructor(parts: Record<string, Blob>) {
        this.parts = parts
      }
    },
  )
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Roll20에 복사' }))
    await screen.findByText(/Roll20용 핸드아웃을 복사했습니다/)
    return { html: await written[0]['text/html'].text(), text: await written[0]['text/plain'].text() }
  } finally {
    Reflect.deleteProperty(navigator, 'clipboard')
    vi.unstubAllGlobals()
  }
}

/** keys 칸들의 (모든 템플릿의) 기본 문구 줄 — 내보낸 HTML · 평문에 하나도 없어야 한다 */
function expectNoDefaultText(exported: { html: string; text: string; code: string }, keys: string[]) {
  const lines = handoutTemplates
    .flatMap((t) => t.fields.filter((f) => keys.includes(f.key)).flatMap((f) => f.defaultText.split('\n')))
    .filter(Boolean)
  for (const line of lines) {
    expect(exported.html, `Roll20 복사 HTML 에 「${line}」`).not.toContain(escapeHtml(line))
    expect(exported.code, `HTML 코드 보기에 「${line}」`).not.toContain(escapeHtml(line))
    expect(exported.text, `Roll20 복사 평문에 「${line}」`).not.toContain(line)
  }
}

/** 정규화하면 바뀌는 값(대문자 hex · 대문자 호스트 · 퍼센트 인코딩 · 한글 경로 · 앞뒤 공백)과 알 수 없는 키 · 숨은 칸 */
const NON_CANONICAL: Stored = {
  v: 1,
  templateId: 'moonlit',
  theme: 'dark',
  fields: {
    cap: 'CAP',
    title: '제목  ',
    body: '본문',
    signature: '',
    caseNo: '숨은 칸 (조사 기록 템플릿의 칸)',
    'bad key': '키 이름이 형식에 맞지 않는 칸',
    count: 3,
  },
  style: { accent: '#ABC', font: 'hand', weight: 'bold' },
  image: { url: 'https://EXAMPLE.com/Maps/%7Euser/지도.png', alt: ' 저택 지도 ', caption: '캡션' },
  extra: { nested: [1, 'two', null], flag: true },
}
const NORMALIZED_URL = 'https://example.com/Maps/%7Euser/%EC%A7%80%EB%8F%84.png'

/** 쓸 수 없는 값: 미래 버전 표시 · 없는 테마 · 위험한 색 · 없는 글꼴 · https 가 아닌 이미지 */
const INVALID: Stored = {
  v: 2,
  templateId: 'casefile',
  theme: '없는 테마',
  fields: { cap: 'CASE', title: '제목', caseNo: '№ 1', date: '일자', agent: '담당', body: '본문', signature: '서명' },
  style: { accent: 'url(javascript:alert(1))', font: 'comic' },
  image: { url: 'javascript:alert(1)', alt: '<b>대체</b>' },
}

describe('핸드아웃 스튜디오 — 고친 값만 저장된다 (저장된 다른 값은 그대로)', () => {
  it('정규화되지 않은 값 · 알 수 없는 키 · 숨은 칸: 본문 · 테마 · 글꼴 · 대체 텍스트 · 주소 · 강조 색을 차례로 고치면 매번 그 경로만 바뀐다', async () => {
    const { saved, settle } = await openStudio(NON_CANONICAL)
    // 화면에는 검사 · 정규화한 값
    expect(canvas().querySelector('img')).toHaveAttribute('src', NORMALIZED_URL)
    expect(accentInput()).toHaveValue('#aabbcc')
    expect(screen.getByRole('button', { name: '손글씨' })).toHaveAttribute('aria-pressed', 'true')
    expect(canvas()).toHaveAttribute('data-theme', 'dark')

    typeInto(field('body'), '고친 본문')
    await settle()
    expect(changedPaths(NON_CANONICAL, saved())).toEqual(['fields.body'])
    expect(saved()).toMatchObject({ fields: { body: '고친 본문' } })

    let before = saved()
    fireEvent.click(screen.getByRole('button', { name: '라벤더 테마' }))
    await settle()
    expect(changedPaths(before, saved())).toEqual(['theme'])
    expect(saved().theme).toBe('purple')

    before = saved()
    fireEvent.click(screen.getByRole('button', { name: '세리프' }))
    await settle()
    expect(changedPaths(before, saved())).toEqual(['style.font'])
    expect(saved()).toMatchObject({ style: { accent: '#ABC', font: 'serif', weight: 'bold' } })

    // 대체 텍스트만 고치면 저장된 주소는 정규화하지 않고 그대로
    before = saved()
    expect(urlInput()).toHaveValue(NORMALIZED_URL)
    expect(altInput()).toHaveValue(' 저택 지도 ')
    fireEvent.change(altInput(), { target: { value: '새 지도' } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 바꾸기/ }))
    await settle()
    expect(changedPaths(before, saved())).toEqual(['image.alt'])
    expect(saved().image).toEqual({ url: 'https://EXAMPLE.com/Maps/%7Euser/지도.png', alt: '새 지도', caption: '캡션' })

    // 주소를 고치면 그 주소만 (입력한 새 주소는 검사한 형식으로)
    before = saved()
    fireEvent.change(urlInput(), { target: { value: ' https://CDN.example.com/New Map.png ' } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 바꾸기/ }))
    await settle()
    expect(changedPaths(before, saved())).toEqual(['image.url'])
    expect(saved().image).toEqual({ url: 'https://cdn.example.com/New%20Map.png', alt: '새 지도', caption: '캡션' })

    before = saved()
    fireEvent.click(screen.getByRole('button', { name: '강조 색 봉랍 빨강' }))
    await settle()
    expect(changedPaths(before, saved())).toEqual(['style.accent'])

    before = saved()
    fireEvent.click(screen.getByRole('button', { name: '테마 기본 강조 색' }))
    await settle()
    expect(changedPaths(before, saved())).toEqual(['style.accent'])
    expect(saved().style).toEqual({ font: 'serif', weight: 'bold' })

    // 지금까지 고친 경로 말고는 처음 저장된 값 그대로
    expect(changedPaths(NON_CANONICAL, saved())).toEqual([
      'fields.body',
      'image.alt',
      'image.url',
      'style.accent',
      'style.font',
      'theme',
    ])
  })

  it('표기만 다른 같은 값을 다시 입력하면(저장된 #ABC 에 #AABBCC, 대문자 호스트 주소를 그대로) 저장하지 않는다', async () => {
    const { saved, updates, settle } = await openStudio(NON_CANONICAL)
    fireEvent.change(accentInput(), { target: { value: '#AABBCC' } })
    fireEvent.click(screen.getByRole('button', { name: '적용' }))
    expect(accentInput()).toHaveValue('#aabbcc')

    fireEvent.change(urlInput(), { target: { value: 'https://EXAMPLE.com/Maps/%7Euser/지도.png' } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 바꾸기/ }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(urlInput()).toHaveValue(NORMALIZED_URL)
    await settle()
    expect(updates()).toBe(0)
    expect(changedPaths(NON_CANONICAL, saved())).toEqual([])

    // 같은 주소를 다른 표기로 넣으면서 대체 텍스트를 고치면 대체 텍스트만
    fireEvent.change(urlInput(), { target: { value: 'HTTPS://example.COM/Maps/%7Euser/지도.png' } })
    fireEvent.change(altInput(), { target: { value: '고친 설명' } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 바꾸기/ }))
    await settle()
    expect(changedPaths(NON_CANONICAL, saved())).toEqual(['image.alt'])
  })

  it('Roll20 출력은 정규화한 강조 색 · 주소를 쓴다 (저장된 표기는 그대로)', async () => {
    const { saved, settle } = await openStudio(NON_CANONICAL)
    const code = roll20Code()
    expect(code).toContain('#aabbcc')
    expect(code).not.toContain('#ABC')
    expect(code).toContain(`src="${NORMALIZED_URL}"`)
    expect(code).not.toContain('EXAMPLE.com')
    expect(code).not.toContain('숨은 칸') // 템플릿에 없는 칸은 출력하지 않는다

    typeInto(field('title'), '새 제목')
    await settle()
    expect(changedPaths(NON_CANONICAL, saved())).toEqual(['fields.title'])
    expect(roll20Code()).toContain(`src="${NORMALIZED_URL}"`)
  })

  it('쓸 수 없는 저장 값은 그대로 두고, 화면 · Roll20 출력에는 쓰지 않는다 (기본값으로 그림)', async () => {
    const { saved, updates, settle } = await openStudio(INVALID)
    expect(canvas().querySelector('img')).toBeNull()
    expect(canvas()).toHaveAttribute('data-theme', 'manila')
    expect(canvas().outerHTML).not.toMatch(/javascript|url\(|comic/i)
    expect(accentInput()).toHaveValue('')
    expect(urlInput()).toHaveValue('')
    expect(screen.getByRole('button', { name: '세리프' })).toHaveAttribute('aria-pressed', 'true')

    const code = roll20Code()
    expect(code).not.toMatch(/javascript|url\(|comic|<img/i)
    expect(code).toContain(getTemplate('casefile').themes[0].colors.accent)

    // 이미 보이는(기본값) 테마 · 글꼴 · 강조 색을 다시 누르거나, 고치지 않은 입력 칸에서 나가도 저장하지 않는다
    fireEvent.click(screen.getByRole('button', { name: '마닐라 서류 테마' }))
    fireEvent.click(screen.getByRole('button', { name: '세리프' }))
    fireEvent.click(screen.getByRole('button', { name: '테마 기본 강조 색' }))
    fireEvent.focus(accentInput())
    fireEvent.blur(accentInput())
    await settle()
    expect(updates()).toBe(0)

    typeInto(field('body'), '고친 본문')
    await settle()
    expect(updates()).toBe(1)
    expect(changedPaths(INVALID, saved())).toEqual(['fields.body'])
    expect(saved()).toMatchObject({ v: 2, theme: '없는 테마', style: INVALID.style, image: INVALID.image })
  })

  it('템플릿을 바꿔도 저장된 테마 · 강조 색 · 이미지 · 숨은 칸은 그대로, 새 템플릿에만 있는 빈자리만 기본 문구로 더한다', async () => {
    const { saved, settle } = await openStudio(NON_CANONICAL)
    fireEvent.click(screen.getByRole('button', { name: /오래된 조사 기록/ }))
    await settle()
    // 숨은 칸(caseNo)은 이미 있으므로 덮어쓰지 않고, date · agent 만 더한다
    expect(changedPaths(NON_CANONICAL, saved())).toEqual(['fields.agent', 'fields.date', 'templateId'])
    expect(field('caseNo').textContent).toBe('숨은 칸 (조사 기록 템플릿의 칸)')
    // 저장된 테마 'dark' 는 이 템플릿에 없어서 첫 테마로 그린다 (저장 값은 그대로)
    expect(saved().theme).toBe('dark')
    expect(canvas()).toHaveAttribute('data-theme', 'manila')

    const before = saved()
    fireEvent.click(screen.getByRole('button', { name: /달빛의 초대/ }))
    await settle()
    expect(changedPaths(before, saved())).toEqual(['templateId'])
    // 돌아오면 원래 고른 테마가 다시 보인다
    expect(canvas()).toHaveAttribute('data-theme', 'dark')
  })

  it('Phase 1 의 { text } 핸드아웃: 첫 편집 때 핸드아웃 형식으로 옮기되 text 와 다른 키는 그대로 두고, 보이는 글은 바뀌지 않는다', async () => {
    const text = '예전 본문\n  들여쓴 줄  \n\n끝 '
    const LEGACY: Stored = { text, note: { from: 'phase1' } }
    const keys = getTemplate('moonlit').fields.map((f) => f.key)
    const { saved, settle } = await openStudio(LEGACY)
    const shown = Object.fromEntries(keys.map((key) => [key, field(key).textContent]))
    expect(shown.body).toBe(text)

    typeInto(field('title'), '고친 제목')
    await settle()
    expect(changedPaths(LEGACY, saved())).toEqual(['fields', 'templateId', 'v'])
    expect(saved().text).toBe(text)
    expect(saved()).toMatchObject({ v: 1, templateId: 'moonlit', note: { from: 'phase1' } })
    const defaults = Object.fromEntries(getTemplate('moonlit').fields.map((f) => [f.key, f.defaultText]))
    expect(saved().fields).toEqual({ ...defaults, body: text, title: '고친 제목' })
    // 고친 칸 말고는 보이는 글이 그대로
    for (const key of keys) if (key !== 'title') expect(field(key).textContent).toBe(shown[key])

    const before = saved()
    typeInto(field('body'), '새 본문')
    await settle()
    expect(changedPaths(before, saved())).toEqual(['fields.body'])
    expect(saved().text).toBe(text)
  })

  it('리뷰 회귀: Phase 1 의 빈 본문 { text: "" } — 빈 칸(placeholder)으로 보이고, 다른 칸을 고쳐도 body 는 "" 로 저장 · 내보내기에 기본 본문이 없다', async () => {
    const LEGACY_EMPTY: Stored = { text: '' }
    const template = getTemplate('moonlit')
    const def = (key: string) => template.fields.find((f) => f.key === key)!
    const { saved, settle } = await openStudio(LEGACY_EMPTY)
    // 기본 본문이 아니라 빈 칸 + placeholder. 저장된 적 없는 칸(제목 등)만 기본 문구
    expect(field('body').textContent).toBe('')
    expect(field('body').matches(':empty')).toBe(true)
    expect(field('body')).toHaveAttribute('data-ph', def('body').placeholder)
    expect(field('title').textContent).toBe(def('title').defaultText)

    typeInto(field('title'), '고친 제목')
    await settle()
    expect(changedPaths(LEGACY_EMPTY, saved())).toEqual(['fields', 'templateId', 'v'])
    expect(saved().text).toBe('')
    expect(saved().fields).toEqual({
      cap: def('cap').defaultText,
      title: '고친 제목',
      body: '',
      signature: def('signature').defaultText,
    })
    expect(field('body').matches(':empty')).toBe(true)

    const code = roll20Code()
    const { html, text } = await copiedForRoll20()
    expect(html).toContain('고친 제목')
    expect(text).toContain('고친 제목')
    expectNoDefaultText({ html, text, code }, ['body'])
  })

  it('리뷰 회귀: 비워 둔 선택 칸("")은 빈 칸으로 보이고, 다른 칸을 고치거나 템플릿을 바꿨다 돌아와도 "" — 내보내기에 기본 문구가 없다', async () => {
    const EMPTIED: Stored = {
      v: 1,
      templateId: 'moonlit',
      theme: 'classic',
      fields: { cap: '', title: '제목', body: '본문', signature: '' },
      style: {},
      image: { url: 'https://cdn.example.com/a.png', alt: '' },
    }
    const { saved, settle } = await openStudio(EMPTIED)
    for (const key of ['cap', 'signature']) expect(field(key).matches(':empty'), key).toBe(true)

    typeInto(field('body'), '고친 본문')
    await settle()
    expect(changedPaths(EMPTIED, saved())).toEqual(['fields.body'])

    fireEvent.click(screen.getByRole('button', { name: /오래된 조사 기록/ }))
    await settle()
    // 조사 기록에도 있는 칸(머리 문구 · 서명)은 "" 그대로 — 새 템플릿의 기본 문구로 채우지 않는다
    for (const key of ['cap', 'signature']) expect(field(key).matches(':empty'), key).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /달빛의 초대/ }))
    await settle()
    expect(saved().fields).toMatchObject({ cap: '', signature: '', body: '고친 본문' })
    expect(saved().image).toEqual({ url: 'https://cdn.example.com/a.png', alt: '' })
    for (const key of ['cap', 'signature']) expect(field(key).matches(':empty'), key).toBe(true)

    const code = roll20Code()
    const { html, text } = await copiedForRoll20()
    expect(html).toContain('고친 본문')
    expectNoDefaultText({ html, text, code }, ['cap', 'signature'])
  })
})
