import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentContent } from '../../../lib/documents'
import { createFakeSupabase } from '../../../test/fakeSupabase'
import { createTestServices, renderApp } from '../../../test/renderApp'
import { BlockCanvas } from '../canvas/BlockCanvas'
import * as exportImage from '../exportImage'
import { layoutOf } from '../layout'
import { MAX_ALT_LENGTH, RECOMMENDED_FIELD_LENGTH, serializeHandout, type HandoutContent } from '../model'
import { createHandoutContent } from '../templates'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'clipboard')
})

function setup(content: DocumentContent = serializeHandout(createHandoutContent('moonlit'))) {
  const fake = createFakeSupabase()
  const row = fake.control.insertDocument({ type: 'handout', title: '달빛 초대장', content })
  renderApp(`/studio/handout/${row.id}`, { client: fake.client })
  const saved = () => fake.control.tables.documents.find((d) => d.id === row.id) as { content: Record<string, never>; version: number }
  return { ...fake, row, saved }
}

/** 편집 캔버스의 텍스트 블록 (템플릿 칸에서 온 블록 id 는 f-칸) */
const field = (key: string) => document.querySelector<HTMLElement>(`.hb-canvas.editable [data-block-id="f-${key}"] [data-hfield]`)!
type Row = { id: string; blocks: { id: string; text?: string; url?: string; alt?: string; style?: Record<string, unknown> }[] }
const rowsOf = (content: unknown) => ((content as { layout?: { rows: Row[] } }).layout?.rows ?? null)
const blockOf = (content: unknown, id: string) => rowsOf(content)?.flatMap((r) => r.blocks).find((b) => b.id === id)
/** 저장된 글: 블록 편집 뒤에는 layout.rows 의 블록, 그 전에는 칸(fields) */
const textOf = (content: unknown, key: string) =>
  rowsOf(content) ? blockOf(content, `f-${key}`)?.text : (content as { fields?: Record<string, string> }).fields?.[key]
const chip = () => document.querySelector('.editor-toolbar [data-status]')
const lengthWarning = () => document.querySelector('.length-warning')

/** contenteditable 에 사용자가 입력한 것처럼: DOM 글자를 바꾸고 input 이벤트 */
function typeInto(el: HTMLElement, text: string) {
  el.textContent = text
  fireEvent.input(el)
}

async function openStudio(content?: DocumentContent) {
  const ctx = setup(content)
  await screen.findByRole('group', { name: '핸드아웃 캔버스' })
  return ctx
}

describe('핸드아웃 스튜디오 — 캔버스 직접 편집', () => {
  it('템플릿 필드를 캔버스에 그리고, 저장 상태 칩을 보여 준다', async () => {
    await openStudio()
    expect(field('title')).toHaveTextContent('달빛 아래의 초대장')
    expect(field('body').textContent).toContain('친애하는 방문객께,\n\n')
    expect(field('title')).toHaveAttribute('role', 'textbox')
    expect(field('title')).toHaveAttribute('aria-label', '텍스트 블록')
    // 처음 열 때는 템플릿 칸에서 블록을 만들어 보여 줄 뿐, 저장 값은 그대로
    expect(screen.getByRole('button', { name: '롤꾸 복사' })).toBeInTheDocument()
    expect(screen.getByLabelText('문서 제목')).toHaveValue('달빛 초대장')
    expect(chip()).toHaveTextContent('저장됨')
  })

  it('입력하면 useDocument 초안이 바뀌고(저장 중 → 저장됨) 편집 중인 요소는 다시 만들어지지 않는다', async () => {
    const { saved, control } = await openStudio()
    const title = field('title')
    const body = field('body')

    vi.useFakeTimers()
    typeInto(title, '새로운 제목 <b>&')
    expect(chip()).toHaveTextContent('저장 중')
    typeInto(body, '첫 줄\n  둘째 줄')
    // 같은 DOM 노드 — React 가 다시 그리지 않아 커서가 유지된다
    expect(field('title')).toBe(title)
    expect(field('body')).toBe(body)
    expect(title.textContent).toBe('새로운 제목 <b>&')

    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(chip()).toHaveTextContent('저장됨')
    expect(control.calls.filter((c) => c.op === 'update')).toHaveLength(1)
    expect(saved().content).toMatchObject({ templateId: 'moonlit' })
    expect(textOf(saved().content, 'title')).toBe('새로운 제목 <b>&')
    expect(textOf(saved().content, 'body')).toBe('첫 줄\n  둘째 줄')
    // 이전 칸(fields)은 지우지 않는다
    expect((saved().content as unknown as { fields: Record<string, string> }).fields.title).toBe('달빛 아래의 초대장')
    expect(field('title')).toBe(title)
  })

  it('붙여넣기는 평문만 (줄바꿈은 그대로)', async () => {
    const { saved } = await openStudio()
    const title = field('title')
    title.textContent = ''
    vi.useFakeTimers()
    fireEvent.paste(title, {
      clipboardData: { getData: (type: string) => (type === 'text/plain' ? '붙인\n  제목' : '<b>x</b>') },
    })
    expect(title.textContent).toBe('붙인\n  제목')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(textOf(saved().content, 'title')).toBe('붙인\n  제목')
  })

  it('Phase 1 의 { text } 핸드아웃도 열리고, 본문을 옮겨 보여 준다', async () => {
    await openStudio({ text: '예전 본문' })
    expect(field('body')).toHaveTextContent('예전 본문')
    expect(field('title')).toHaveTextContent('달빛 아래의 초대장')
  })

  it('충돌 → "서버 버전 불러오기" 를 고르면 캔버스 글자도 서버 값으로 바뀐다', async () => {
    const { control, row } = await openStudio()
    const serverContent = serializeHandout({
      ...createHandoutContent('moonlit'),
      fields: { ...createHandoutContent('moonlit').fields, title: '노트북에서 바꾼 제목' },
    })
    control.serverEdit('documents', row.id, { content: serverContent })

    vi.useFakeTimers()
    typeInto(field('title'), '휴대폰 제목')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(chip()).toHaveTextContent('충돌 발생')
    expect(screen.getByRole('alert')).toHaveTextContent('다른 기기에서 이 문서가 먼저 수정되었어요')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '서버 버전 불러오기' }))
    })
    expect(field('title').textContent).toBe('노트북에서 바꾼 제목')
    expect(chip()).toHaveTextContent('저장됨')
  })
})

describe('핸드아웃 스튜디오 — 휴대폰에서 충돌', () => {
  it('충돌 안내가 뜨면 입력 중이던 칸에서 커서를 빼고(키보드 내림), 입력한 글자는 남아 "내 변경으로 덮어쓰기"로 저장된다', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('750'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    try {
      const { control, row, saved } = await openStudio()
      control.serverEdit('documents', row.id, { title: 'PC에서 바꾼 제목' })

      vi.useFakeTimers()
      const body = field('body')
      body.focus()
      expect(body).toHaveFocus()
      typeInto(body, '휴대폰에서 쓴 본문')
      await act(() => vi.advanceTimersByTimeAsync(800))

      expect(screen.getByRole('alert')).toHaveTextContent('다른 기기에서 이 문서가 먼저 수정되었어요')
      expect(body).not.toHaveFocus()
      expect(body.textContent).toBe('휴대폰에서 쓴 본문')

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '내 변경으로 덮어쓰기' }))
      })
      await act(() => vi.advanceTimersByTimeAsync(800))
      expect(textOf(saved().content, 'body')).toBe('휴대폰에서 쓴 본문')
      expect(screen.queryByText('다른 기기에서 이 문서가 먼저 수정되었어요')).not.toBeInTheDocument()
    } finally {
      window.matchMedia = original
    }
  })
})

describe('핸드아웃 스튜디오 — 긴 글 (화면 = 저장 값, 자르지 않음)', () => {
  const LONG = RECOMMENDED_FIELD_LENGTH + 1234
  const longText = (tail: string) => `${'긴 본문 줄입니다.  \n'.repeat(Math.ceil(LONG / 12)).slice(0, LONG)}${tail}`

  it('권장 한도를 넘게 입력해도 화면 글자 전체를 저장하고 경고만 보여 준다', async () => {
    const { saved } = await openStudio()
    expect(screen.queryByText(/권장 한도/)).not.toBeInTheDocument()
    const body = field('body')
    const text = longText('마지막 문장 끝  ')

    vi.useFakeTimers()
    typeInto(body, text)
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(body.textContent).toBe(text)
    expect(textOf(saved().content, 'body')).toBe(text)
    expect(field('body')).toBe(body)
    expect(lengthWarning()).toHaveTextContent(
      `텍스트 블록이 ${text.length.toLocaleString('ko-KR')}자로 권장 한도(${RECOMMENDED_FIELD_LENGTH.toLocaleString('ko-KR')}자)를 넘습니다.`,
    )
  })

  it('긴 글을 붙여 넣어도 전부 저장된다', async () => {
    const { saved } = await openStudio()
    const body = field('body')
    body.textContent = ''
    const text = longText('붙여 넣은 끝')
    vi.useFakeTimers()
    fireEvent.paste(body, { clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') } })
    expect(body.textContent).toBe(text)
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(textOf(saved().content, 'body')).toBe(text)
  })

  it('20,000자를 넘는 Phase 1 핸드아웃: 전체를 보여 주고, 다른 칸을 고쳐도 본문은 그대로 저장 (회귀)', async () => {
    const text = longText('예전 본문의 마지막')
    const { saved } = await openStudio({ text })
    expect(field('body').textContent).toBe(text)
    expect(lengthWarning()).toHaveTextContent(`텍스트 블록이 ${text.length.toLocaleString('ko-KR')}자로 권장 한도`)

    vi.useFakeTimers()
    typeInto(field('title'), '고친 제목')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(textOf(saved().content, 'title')).toBe('고친 제목')
    expect(textOf(saved().content, 'body')).toBe(text)
    // 이전 본문 text 도 그대로 남는다
    expect((saved().content as unknown as { text: string }).text).toBe(text)
    expect(field('body').textContent).toBe(text)
  })

  it('동기화 비교는 글자 전체로: 앞 20,000자가 같고 뒤만 다른 서버 버전을 불러오면 화면도 바뀐다', async () => {
    const { control, row } = await openStudio()
    const serverBody = longText('서버의 끝')
    const serverContent = serializeHandout({
      ...createHandoutContent('moonlit'),
      fields: { ...createHandoutContent('moonlit').fields, body: serverBody },
    })
    control.serverEdit('documents', row.id, { content: serverContent })

    vi.useFakeTimers()
    const localBody = longText('내 기기의 끝')
    typeInto(field('body'), localBody)
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(chip()).toHaveTextContent('충돌 발생')
    expect(field('body').textContent).toBe(localBody)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '서버 버전 불러오기' }))
    })
    expect(field('body').textContent).toBe(serverBody)
  })

  it('공백만 있는 칸도 그대로 저장된다', async () => {
    const { saved } = await openStudio()
    vi.useFakeTimers()
    typeInto(field('signature'), '   ')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(field('signature').textContent).toBe('   ')
    expect(textOf(saved().content, 'signature')).toBe('   ')
  })
})

describe('핸드아웃 스튜디오 — 줄바꿈만 있는 본문 (회귀: 빈 본문에서 Enter 한 빈 줄이 지워지던 문제)', () => {
  /** 브라우저가 실제로 만드는 DOM 으로 바꾸고 input 이벤트 (값은 editableText.test.ts 의 Chrome 실측) */
  function browserInput(el: HTMLElement, html: string) {
    el.innerHTML = html
    fireEvent.input(el)
  }
  const withBody = (body: string): DocumentContent => {
    const start = createHandoutContent('moonlit')
    return serializeHandout({ ...start, fields: { ...start.fields, body } })
  }

  it.each([
    ['plaintext-only', '\n\n', '\nabc'],
    ['true', '<div><br></div><div><br></div>', '<div><br></div><div>abc</div>'],
  ])('%s: 빈 본문에서 Enter → 빈 줄이 남고, 이어서 쓴 글은 그 빈 줄 다음에 저장된다', async (_, afterEnter, afterTyping) => {
    const { saved } = await openStudio()
    const body = field('body')
    vi.useFakeTimers()

    // 다 지우면 브라우저가 남긴 자리 표시 <br> 은 빈 값 → 칸을 비워 placeholder
    browserInput(body, '<br>')
    expect(body.innerHTML).toBe('')
    expect(body.matches(':empty')).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(textOf(saved().content, 'body')).toBe('')

    // Enter: 빈 줄은 빈 값이 아니다 — 화면을 지우지 않고, placeholder 도 없다
    browserInput(body, afterEnter)
    const lineNode = body.firstChild
    expect(body.innerHTML).toBe(afterEnter)
    expect(body.matches(':empty')).toBe(false)
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(textOf(saved().content, 'body')).toBe('\n')
    // 저장 후 동기화 비교(같은 값)도 화면을 다시 쓰지 않는다 → 커서 유지
    expect(body.firstChild).toBe(lineNode)
    expect(body.innerHTML).toBe(afterEnter)

    // 이어서 입력한 글은 빈 줄 다음에
    browserInput(body, afterTyping)
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(textOf(saved().content, 'body')).toBe('\nabc')
    expect(field('body')).toBe(body)
  })

  it.each(['\n\n', '\n', '\n\nabc', 'abc\n'])('본문 %j: 열면 그대로 보이고, 다른 칸을 고쳐 저장 → 다시 열어도 그대로', async (value) => {
    const { saved } = await openStudio(withBody(value))
    const body = field('body')
    // 줄바꿈으로 끝나는 값은 마지막 빈 줄이 보이도록 \n 하나를 더 그린다 (브라우저가 Enter 때 하는 것과 같다)
    expect(body.textContent).toBe(value.endsWith('\n') ? `${value}\n` : value)
    expect(body.matches(':empty')).toBe(false)

    vi.useFakeTimers()
    typeInto(field('title'), '다른 칸')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(textOf(saved().content, 'title')).toBe('다른 칸')
    expect(textOf(saved().content, 'body')).toBe(value)
    expect(field('body').textContent).toBe(body.textContent)
    vi.useRealTimers()

    // 다시 열기 (저장된 content 그대로)
    const reloaded = saved().content as unknown as DocumentContent
    cleanup()
    const again = await openStudio(reloaded)
    expect(field('body').textContent).toBe(value.endsWith('\n') ? `${value}\n` : value)
    vi.useFakeTimers()
    typeInto(field('title'), '또 다른 칸')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(textOf(again.saved().content, 'body')).toBe(value)
  })

  it('동기화: 서버 버전의 줄바꿈만 있는 본문을 불러오면 화면에 그대로 (지우지 않음)', async () => {
    const { control, row } = await openStudio()
    control.serverEdit('documents', row.id, { content: withBody('\n\n') })
    vi.useFakeTimers()
    typeInto(field('body'), '내 기기의 본문')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(chip()).toHaveTextContent('충돌 발생')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '서버 버전 불러오기' }))
    })
    expect(field('body').textContent).toBe('\n\n\n')
    expect(field('body').matches(':empty')).toBe(false)
  })

  it('읽기 전용 미리보기도 줄바꿈으로 끝나는 값의 마지막 빈 줄을 그린다', () => {
    const start = createHandoutContent('moonlit')
    const content: HandoutContent = { ...start, fields: { ...start.fields, body: '\n\n' } }
    const { container } = render(<BlockCanvas layout={layoutOf(content)} />)
    const bodyEl = Array.from(container.querySelectorAll('.hc-field')).find((el) => el.textContent === '\n\n\n')
    expect(bodyEl).toBeDefined()
  })
})

describe('핸드아웃 스튜디오 — 블록 편집 · 디자인 설정', () => {
  const block = (id: string) => document.querySelector<HTMLElement>(`.hb-canvas.editable [data-block-id="${id}"]`)!
  const select = (id: string) => fireEvent.pointerDown(block(id))
  const updates = (control: ReturnType<typeof createFakeSupabase>['control']) =>
    control.calls.filter((c) => c.op === 'update').length

  it('템플릿 선택 · 테마 · 강조 색 · 글꼴 메뉴는 없고, 배경색 · 텍스트 · 블록 메뉴가 있다', async () => {
    await openStudio()
    const panel = screen.getByRole('complementary', { name: '디자인 설정' })
    expect(within(panel).queryByRole('button', { name: /오래된 조사 기록/ })).not.toBeInTheDocument()
    expect(within(panel).queryByText('강조 색')).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: '산세리프' })).not.toBeInTheDocument()
    expect(within(panel).getByLabelText('배경색 HEX 코드')).toHaveValue('#e8ddc9')
    expect(within(panel).getByText(/블록을 고르면 여기에 편집 옵션이 나와요/)).toBeInTheDocument()
    // 순서: 배경색 → 블록 추가 → 편집
    const labels = [...panel.querySelectorAll('.panel-section > .field-label')].map((el) => el.textContent)
    expect(labels).toEqual(['배경색', '블록 추가', '편집'])
    expect(within(panel).getByRole('button', { name: /선택한 블록 삭제/ })).toBeDisabled()
    // 비공개 안내는 미리보기 위, 내보내기는 미리보기 아래
    expect(screen.getByRole('region', { name: '캔버스' })).toHaveTextContent('문서는 기본적으로 비공개로 내 계정에만 저장돼요.')
    expect(screen.getByRole('group', { name: '내보내기' })).toHaveTextContent('롤꾸 복사')
    expect(screen.queryByRole('button', { name: 'HTML 코드 보기' })).not.toBeInTheDocument()
  })

  it('배경색: HEX 검사 · 색 고르기 · 블록은 저장하지 않고 style.background 만', async () => {
    const { saved } = await openStudio()
    const hex = screen.getByLabelText('배경색 HEX 코드')
    fireEvent.change(hex, { target: { value: 'red' } })
    fireEvent.submit(hex)
    expect(screen.getByRole('alert')).toHaveTextContent('#RRGGBB 형식의 색을 입력해 주세요')
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText('배경색 HEX 코드'), { target: { value: '#D9E4DC' } })
    fireEvent.submit(screen.getByLabelText('배경색 HEX 코드'))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved().content).toMatchObject({ style: { background: '#d9e4dc' } })
    expect(rowsOf(saved().content)).toBeNull()
    expect(document.querySelector<HTMLElement>('.hb-canvas.editable .hc-frame')!.style.backgroundColor).toBe('rgb(217, 228, 220)')

    fireEvent.change(screen.getByLabelText('배경색 고르기'), { target: { value: '#112233' } })
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved().content).toMatchObject({ style: { background: '#112233' } })
  })

  it('텍스트 블록을 고르면 글자 색 · 굵게 · 기울임 · 크기(1px, 8–48)를 바꾼다', async () => {
    const { saved, control } = await openStudio()
    select('f-title')
    expect(block('f-title')).toHaveClass('is-selected')
    expect(screen.getByLabelText('글자 색 HEX 코드')).toHaveValue('#594733')
    expect(screen.getByLabelText('글자 크기 (px)')).toHaveValue('30')

    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '굵게' }))
    fireEvent.click(screen.getByRole('button', { name: '기울임' }))
    fireEvent.click(screen.getByRole('button', { name: '글자 크게' }))
    fireEvent.change(screen.getByLabelText('글자 색 HEX 코드'), { target: { value: '#9b3b2f' } })
    fireEvent.submit(screen.getByLabelText('글자 색 HEX 코드'))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(blockOf(saved().content, 'f-title')?.style).toMatchObject({ bold: true, italic: true, size: 31, color: '#9b3b2f' })
    expect(screen.getByRole('button', { name: '굵게' })).toHaveAttribute('aria-pressed', 'true')
    const title = field('title')
    expect(title.style.fontSize).toBe('31px')
    expect(title.style.fontWeight).toBe('700')

    // 크기 입력은 정수 · 8–48 로 맞춘다
    const size = screen.getByLabelText('글자 크기 (px)')
    fireEvent.change(size, { target: { value: '120' } })
    fireEvent.blur(size)
    expect(screen.getByLabelText('글자 크기 (px)')).toHaveValue('48')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(blockOf(saved().content, 'f-title')?.style).toMatchObject({ size: 48 })
    // 굵게를 끄면 그 키를 뺀다
    fireEvent.click(screen.getByRole('button', { name: '굵게' }))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(blockOf(saved().content, 'f-title')?.style).not.toHaveProperty('bold')
    const before = updates(control)
    // 같은 색을 다시 적용하면 저장하지 않는다
    fireEvent.submit(screen.getByLabelText('글자 색 HEX 코드'))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(updates(control)).toBe(before)
  })

  it('글상자 추가: 고른 블록 아래에 넣고 바로 입력 · 선택한 블록 삭제', async () => {
    const { saved } = await openStudio()
    select('f-title')
    fireEvent.click(screen.getByRole('button', { name: /글상자 추가/ }))
    const ids = () => [...document.querySelectorAll<HTMLElement>('.hb-canvas.editable [data-block-id]')].map((el) => el.dataset.blockId)
    const added = ids()[ids().indexOf('f-title') + 1]!
    expect(added).toMatch(/^b/)
    const box = document.querySelector<HTMLElement>(`.hb-canvas.editable [data-block-id="${added}"] [data-hfield]`)!
    expect(box).toHaveFocus()
    vi.useFakeTimers()
    typeInto(box, '새 단서')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(blockOf(saved().content, added)).toMatchObject({ type: 'text', text: '새 단서', style: { size: 14 } })

    fireEvent.click(screen.getByRole('button', { name: /선택한 블록 삭제/ }))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(blockOf(saved().content, added)).toBeUndefined()
    expect(screen.getByRole('button', { name: /선택한 블록 삭제/ })).toBeDisabled()
  })

  it('이미지 추가: https 공개 주소만 · 넣기 · 빼기 (블록은 남는다)', async () => {
    const { saved } = await openStudio()
    fireEvent.click(screen.getByRole('button', { name: /이미지 추가/ }))
    expect(document.querySelector('.hb-canvas.editable .hb-image-empty')).toHaveTextContent('이미지 주소를 넣어 주세요')
    fireEvent.change(screen.getByLabelText('이미지 주소 (https)'), { target: { value: 'http://example.com/map.png' } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 넣기/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('https:// 로 시작하는 공개 이미지 주소만')

    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText('이미지 주소 (https)'), { target: { value: 'https://cdn.example.com/map.png' } })
    fireEvent.change(screen.getByLabelText('대체 텍스트'), { target: { value: '저택 지도' } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 넣기/ }))
    expect(document.querySelector('.hb-canvas.editable img')).toHaveAttribute('src', 'https://cdn.example.com/map.png')
    await act(() => vi.advanceTimersByTimeAsync(800))
    const img = rowsOf(saved().content)!.flatMap((r) => r.blocks).find((b) => b.url)
    expect(img).toMatchObject({ type: 'image', url: 'https://cdn.example.com/map.png', alt: '저택 지도' })
    // 맨 아래에 들어간다 (고른 블록이 없었으므로)
    expect(rowsOf(saved().content)!.at(-1)!.blocks[0].id).toBe(img!.id)

    fireEvent.click(screen.getByRole('button', { name: '이미지 빼기' }))
    expect(document.querySelector('.hb-canvas.editable img')).toBeNull()
    expect(document.querySelector(`.hb-canvas.editable [data-block-id="${img!.id}"]`)).not.toBeNull()
  })

  it('구분선: 고르면 선 색을 바꾸고 · 구분선 추가 · 이미지에서 이미지를 빼면 구분선이 아니라 이미지 고르기로', async () => {
    const { saved } = await openStudio()
    const rule = document.querySelector<HTMLElement>('.hb-canvas.editable [data-block-type="image"]')!
    fireEvent.pointerDown(rule)
    expect(screen.getByText('구분선 편집')).toBeInTheDocument()
    expect(screen.queryByLabelText('이미지 주소 (https)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('구분선 색 HEX 코드')).toHaveValue('#9c795f')
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText('구분선 색 HEX 코드'), { target: { value: '#335577' } })
    fireEvent.submit(screen.getByLabelText('구분선 색 HEX 코드'))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(blockOf(saved().content, rule.dataset.blockId!)).toMatchObject({ rule: { widthPercent: 70, color: '#335577' } })
    expect(rule.querySelector<HTMLElement>('.hc-rule')!.style.backgroundColor).toBe('rgb(51, 85, 119)')

    // 구분선 추가: 고른 구분선 아래 · 새 구분선 색은 템플릿 구분선 색
    fireEvent.click(screen.getByRole('button', { name: /구분선 추가/ }))
    await act(() => vi.advanceTimersByTimeAsync(800))
    const rows = rowsOf(saved().content)!
    const at = rows.findIndex((r) => r.blocks[0].id === rule.dataset.blockId)
    expect(rows[at + 1].blocks[0]).toMatchObject({ type: 'image', rule: { widthPercent: 100, color: '#335577' } })
    expect(screen.getByText('구분선 편집')).toBeInTheDocument()
  })

  it('이미지를 빼면 빈 이미지 블록(이미지 고르기)이 남는다', async () => {
    const { saved } = await openStudio()
    fireEvent.click(screen.getByRole('button', { name: /이미지 추가/ }))
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText('이미지 주소 (https)'), { target: { value: 'https://cdn.example.com/a.png' } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 넣기/ }))
    fireEvent.click(screen.getByRole('button', { name: '이미지 빼기' }))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(document.querySelector('.hb-canvas.editable .hb-image-empty')).not.toBeNull()
    expect(screen.getByText('이미지 편집')).toBeInTheDocument()
    const img = rowsOf(saved().content)!.at(-1)!.blocks[0]
    expect(img).not.toHaveProperty('url')
    expect(img).not.toHaveProperty('rule')
  })

  it('블록 옮기기: 고른 블록의 손잡이에서 ↑ ↓ 키로 (끌기와 같은 연산)', async () => {
    const { saved } = await openStudio()
    select('f-signature')
    const handle = screen.getByRole('button', { name: '블록 옮기기' })
    vi.useFakeTimers()
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    await act(() => vi.advanceTimersByTimeAsync(800))
    const order = rowsOf(saved().content)!.map((r) => r.blocks.map((b) => b.id).join('+'))
    expect(order.indexOf('f-signature')).toBe(order.indexOf('f-body') - 1)
    // 블록 이동은 글자를 바꾸지 않는다
    expect(textOf(saved().content, 'signature')).toBe('— 블랙우드 저택의 주인')
  })

  it('되돌리기 · 다시 실행: 버튼과 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, 이어서 입력한 글은 한 번에', async () => {
    const { saved } = await openStudio()
    const undoBtn = screen.getByRole('button', { name: /되돌리기/ })
    const redoBtn = screen.getByRole('button', { name: /다시 실행/ })
    expect(undoBtn).toBeDisabled()
    select('f-title')
    vi.useFakeTimers()
    typeInto(field('title'), '달')
    typeInto(field('title'), '달빛')
    typeInto(field('title'), '달빛 편지')
    fireEvent.click(screen.getByRole('button', { name: '굵게' }))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(textOf(saved().content, 'title')).toBe('달빛 편지')

    // 굵게 되돌리기 (버튼)
    fireEvent.click(undoBtn)
    expect(screen.getByRole('button', { name: '굵게' })).toHaveAttribute('aria-pressed', 'false')
    // 글상자에서 Ctrl+Z: 이어서 입력한 세 번이 한 번에 되돌아간다
    fireEvent.keyDown(field('title'), { key: 'z', ctrlKey: true })
    expect(field('title').textContent).toBe('달빛 아래의 초대장')
    expect(undoBtn).toBeDisabled()
    // 다시 실행: Ctrl+Shift+Z · Ctrl+Y
    fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true })
    expect(field('title').textContent).toBe('달빛 편지')
    fireEvent.keyDown(document.body, { key: 'y', metaKey: true })
    expect(screen.getByRole('button', { name: '굵게' })).toHaveAttribute('aria-pressed', 'true')
    expect(redoBtn).toBeDisabled()
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(blockOf(saved().content, 'f-title')).toMatchObject({ text: '달빛 편지', style: { bold: true } })
    // 입력칸(HEX)에서는 그 칸의 되돌리기 — 에디터 기록은 그대로
    fireEvent.keyDown(screen.getByLabelText('배경색 HEX 코드'), { key: 'z', ctrlKey: true })
    expect(field('title').textContent).toBe('달빛 편지')
  })

  it('글상자 정렬: 왼쪽 · 가운데 · 오른쪽', async () => {
    const { saved } = await openStudio()
    select('f-body')
    expect(screen.getByRole('button', { name: '가운데 정렬' })).toHaveAttribute('aria-pressed', 'true')
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '오른쪽 정렬' }))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(blockOf(saved().content, 'f-body')?.style).toMatchObject({ align: 'right' })
    expect(block('f-body').style.textAlign).toBe('right')
  })

  it('2열: 사이 손잡이에서 ← → 키로 좌우를 바꾸고, 두 블록은 같은 줄 높이 · 여백은 줄에 한 번', async () => {
    const two = {
      ...serializeHandout(createHandoutContent('moonlit')),
      layout: {
        rows: [
          {
            id: 'r',
            split: 70,
            blocks: [
              { id: 'a', type: 'text', text: '왼쪽', style: { size: 14, color: '#000000', marginTop: 20 } },
              { id: 'b', type: 'image', url: 'https://cdn.example.com/x.png', maxWidth: 300 },
            ],
          },
        ],
      },
    }
    const ctx = await openStudio(two as unknown as DocumentContent)
    const row = document.querySelector<HTMLElement>('.hb-canvas.editable .hb-row.two')!
    expect(row.style.gridTemplateColumns).toMatch(/70fr\) 16px minmax\(0(px)?, 30fr\)/)
    expect(row.style.marginTop).toBe('20px')
    expect(block('a').style.marginTop).toBe('0px')
    // 이미지는 블록 너비를 꽉 채운다
    expect(block('b').querySelector('img')!.style.width).toBe('100%')
    const divider = screen.getByRole('separator', { name: /2열 너비 조절/ })
    expect(divider).toHaveAttribute('aria-valuenow', '70')
    vi.useFakeTimers()
    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    await act(() => vi.advanceTimersByTimeAsync(800))
    const saved2 = rowsOf(ctx.saved().content)![0] as unknown as { split: number; blocks: { id: string }[] }
    expect(saved2.blocks.map((b) => b.id)).toEqual(['b', 'a'])
    expect(saved2.split).toBe(30)
  })

  it(`${MAX_ALT_LENGTH}자가 넘는 대체 텍스트는 자르지 않고 알리기만 한다`, async () => {
    await openStudio()
    fireEvent.click(screen.getByRole('button', { name: /이미지 추가/ }))
    fireEvent.change(screen.getByLabelText('이미지 주소 (https)'), { target: { value: 'https://cdn.example.com/map.png' } })
    fireEvent.change(screen.getByLabelText('대체 텍스트'), { target: { value: 'a'.repeat(MAX_ALT_LENGTH + 1) } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 넣기/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(`지금 ${MAX_ALT_LENGTH + 1}자예요`)
    expect(screen.getByLabelText('대체 텍스트')).toHaveValue('a'.repeat(MAX_ALT_LENGTH + 1))
    expect(document.querySelector('.hb-canvas.editable img')).toBeNull()
  })
})

describe('핸드아웃 스튜디오 — 내보내기', () => {
  it('"롤꾸 복사": 편집한 글이 담긴 text/html + text/plain 을 복사하고 토스트 (class 없음 · Pretendard)', async () => {
    await openStudio()
    const written: Record<string, Blob>[] = []
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: vi.fn((items: { parts: Record<string, Blob> }[]) => (written.push(items[0].parts), Promise.resolve())) },
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
    typeInto(field('title'), '복사할 <제목>')

    fireEvent.click(screen.getByRole('button', { name: '롤꾸 복사' }))
    expect(await screen.findByText(/롤꾸를 복사했습니다/)).toBeInTheDocument()
    const html = await written[0]['text/html'].text()
    expect(html).toContain('복사할 &lt;제목&gt;')
    expect(html).toContain('Pretendard')
    expect(html).not.toMatch(/\sclass=/)
    expect(html).not.toContain('<style')
    expect(await written[0]['text/plain'].text()).toContain('복사할 <제목>')
  })

  it('복사가 모두 실패하면 한국어 오류 토스트', async () => {
    await openStudio()
    fireEvent.click(screen.getByRole('button', { name: '롤꾸 복사' }))
    expect(await screen.findByText(/클립보드 접근을 차단했습니다/)).toBeInTheDocument()
  })

  it('이미지 파일 저장(JPG): 화면 밖 캔버스를 찍어 제목.jpg 로 내려받는다', async () => {
    await openStudio()
    const jpg = vi.spyOn(exportImage, 'handoutJpg').mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,AAAA', skippedImages: 1 })
    const download = vi.spyOn(exportImage, 'downloadDataUrl').mockImplementation(() => {})
    try {
      fireEvent.click(screen.getByRole('button', { name: /이미지 파일 저장/ }))
      expect(await screen.findByText(/달빛 초대장\.jpg 파일을 저장했습니다\. 다른 사이트에서 막아 둔 이미지 1개는 빼고/)).toBeInTheDocument()
      expect(jpg.mock.calls[0][0].closest('.jpg-snapshot')).not.toBeNull()
      expect(jpg.mock.calls[0][1]).toBe('#e8ddc9')
      expect(download).toHaveBeenCalledWith('달빛 초대장.jpg', 'data:image/jpeg;base64,AAAA')
    } finally {
      jpg.mockRestore()
      download.mockRestore()
    }
  })
})

describe('템플릿 아카이브 › 핸드아웃 · 템플릿 에디터', () => {
  it('핸드아웃 화면에는 "새로 시작"이 없고, 새 핸드아웃 버튼이 템플릿 선택 창을 띄운다', async () => {
    const fake = createFakeSupabase()
    renderApp('/templates', { client: fake.client })
    expect(await screen.findByRole('heading', { level: 1, name: '핸드아웃' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '새로 시작' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /템플릿으로 시작/ })).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: '새 핸드아웃' }))
    expect(screen.getByRole('button', { name: /템플릿을 골라 새 핸드아웃 만들기/ })).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: '템플릿 선택' })
    fireEvent.click(within(dialog).getByRole('button', { name: '비밀 결사의 인장 템플릿으로 시작' }))
    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    expect(screen.getByTestId('location').textContent).toMatch(/^\/studio\/handout\/doc-/)
    expect(fake.control.tables.documents[0]).toMatchObject({
      type: 'handout',
      title: '봉인된 서약',
      content: { templateId: 'order', theme: 'obsidian' },
    })
    expect(field('seal')).toHaveTextContent('✠')
  })

  it('핸드아웃을 고르면 미리보기 창이 뜨고, "이 템플릿 사용하기"는 사본을 만들어 연다 (원본 그대로)', async () => {
    const fake = createFakeSupabase()
    const stored = { ...serializeHandout(createHandoutContent('forest')), extra: { keep: '저장 값 그대로' } }
    const original = fake.control.insertDocument({ type: 'handout', title: '잃어버린 연대기', content: stored })
    renderApp('/templates', { client: fake.client })

    const mine = await screen.findByRole('region', { name: '내 핸드아웃' })
    fireEvent.click(await within(mine).findByRole('button', { name: '잃어버린 연대기 미리보기' }))
    const dialog = screen.getByRole('dialog', { name: '잃어버린 연대기' })
    expect(within(dialog).getByRole('link', { name: /원본 편집/ })).toHaveAttribute('href', `/studio/handout/${original.id}`)
    // 아직 화면은 그대로
    expect(screen.getByTestId('location').textContent).toBe('/templates')

    fireEvent.click(within(dialog).getByRole('button', { name: /이 템플릿 사용하기/ }))
    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    const docs = fake.control.tables.documents
    expect(docs).toHaveLength(2)
    const copy = docs.find((d) => d.id !== original.id)!
    expect(screen.getByTestId('location').textContent).toBe(`/studio/handout/${copy.id}`)
    expect(copy).toMatchObject({ type: 'handout', title: '잃어버린 연대기 (사본)' })
    // 사본은 저장된 값을 그대로 복사한다 (정규화하지 않음)
    expect(copy.content).toEqual(stored)
    expect(docs.find((d) => d.id === original.id)).toMatchObject({ title: '잃어버린 연대기', content: stored, version: 1 })
  })

  it('목록 보기에서 줄을 눌러도 미리보기 창이 뜬다', async () => {
    const fake = createFakeSupabase()
    fake.control.insertDocument({ type: 'handout', title: '봉인된 편지' })
    renderApp('/templates', { client: fake.client })
    const mine = await screen.findByRole('region', { name: '내 핸드아웃' })
    await within(mine).findByRole('button', { name: '봉인된 편지 미리보기' })
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '보기 방식' })).getByRole('radio', { name: /목록/ }))
    fireEvent.click(within(within(mine).getByRole('table')).getByRole('button', { name: '봉인된 편지' }))
    expect(screen.getByRole('dialog', { name: '봉인된 편지' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '닫기' }))
    fireEvent.click(within(within(mine).getByRole('table')).getByRole('button', { name: '봉인된 편지 미리보기' }))
    expect(screen.getByRole('dialog', { name: '봉인된 편지' })).toBeInTheDocument()
  })

  it('템플릿 선택 창 검색: 이름·분류·설명으로 거르고, 없으면 안내한다', async () => {
    renderApp('/studio/handout', { client: createFakeSupabase().client })
    const dialog = await screen.findByRole('dialog', { name: '템플릿 선택' })
    const search = within(dialog).getByRole('searchbox', { name: '템플릿 검색' })
    expect(search).toHaveFocus()
    const shown = () => within(dialog).queryAllByRole('article').map((a) => a.getAttribute('aria-labelledby'))

    fireEvent.change(search, { target: { value: '판타지' } }) // 분류
    expect(shown()).toEqual(['tpl-order', 'tpl-forest'])
    fireEvent.change(search, { target: { value: '조사 기록' } }) // 이름 (공백 무시)
    expect(shown()).toEqual(['tpl-casefile'])
    fireEvent.change(search, { target: { value: '1920년대' } }) // 설명
    expect(shown()).toEqual(['tpl-casefile'])
    fireEvent.change(search, { target: { value: '우주선' } })
    expect(shown()).toEqual([])
    expect(within(dialog).getByRole('status')).toHaveTextContent('맞는 템플릿이 없어요')
    fireEvent.change(search, { target: { value: '' } })
    expect(shown()).toHaveLength(4)
  })

  it('내 핸드아웃: 미리보기/목록 토글(기억), 핸드아웃만 보인다', async () => {
    const fake = createFakeSupabase()
    fake.control.insertDocument({
      type: 'handout',
      title: '봉인된 편지',
      content: serializeHandout(createHandoutContent('order')),
    })
    fake.control.insertDocument({ type: 'log', title: '세션 1' })
    renderApp('/templates', { client: fake.client })

    const mine = await screen.findByRole('region', { name: '내 핸드아웃' })
    await waitFor(() => expect(within(mine).getByText(/핸드아웃 1개/)).toBeInTheDocument())
    // 기본은 미리보기 카드
    expect(within(mine).getByRole('button', { name: '봉인된 편지 미리보기' })).toBeInTheDocument()
    expect(within(mine).queryByRole('table')).not.toBeInTheDocument()
    expect(within(mine).queryByText('세션 1')).not.toBeInTheDocument()

    const toggle = screen.getByRole('radiogroup', { name: '보기 방식' })
    fireEvent.click(within(toggle).getByRole('radio', { name: /목록/ }))
    const table = within(mine).getByRole('table', { name: '문서 목록' })
    expect(table).toHaveTextContent('봉인된 편지')
    expect(table).not.toHaveTextContent('세션 1')
    expect(localStorage.getItem('folio-archive-view')).toBe('list')
  })

  it('삭제는 확인 후 soft delete 하고 목록에서 뺀다 (미리보기·목록 모두)', async () => {
    const fake = createFakeSupabase()
    fake.control.insertDocument({ type: 'handout', title: '봉인된 편지' })
    fake.control.insertDocument({ type: 'handout', title: '달빛 초대장' })
    renderApp('/templates', { client: fake.client })
    const mine = await screen.findByRole('region', { name: '내 핸드아웃' })

    fireEvent.click(await within(mine).findByRole('button', { name: '봉인된 편지 삭제' }))
    const dialog = screen.getByRole('dialog', { name: '핸드아웃을 삭제할까요?' })
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mine).not.toHaveTextContent('봉인된 편지')
    expect(fake.control.tables.documents.find((d) => d.title === '봉인된 편지')?.deleted_at).toEqual(expect.any(String))

    fireEvent.click(within(screen.getByRole('radiogroup', { name: '보기 방식' })).getByRole('radio', { name: /목록/ }))
    fireEvent.click(within(mine).getByRole('button', { name: '달빛 초대장 삭제' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(within(mine).getByText(/아직 만든 핸드아웃이 없어요/)).toBeInTheDocument())
  })

  it('/studio/handout(템플릿 에디터 메뉴)은 템플릿 선택 창을 띄우고, 고르면 새 핸드아웃을 연다', async () => {
    const fake = createFakeSupabase()
    renderApp('/studio/handout', { client: fake.client })
    const dialog = await screen.findByRole('dialog', { name: '템플릿 선택' })
    expect(within(dialog).getAllByRole('article')).toHaveLength(4)
    fireEvent.click(within(dialog).getByRole('button', { name: '숲의 기록 템플릿으로 시작' }))

    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    expect(screen.getByTestId('location').textContent).toMatch(/^\/studio\/handout\/doc-/)
    expect(fake.control.tables.documents[0]).toMatchObject({ content: { templateId: 'forest' } })
  })

  it('템플릿 선택 창을 닫으면 (바로 들어온 경우) 템플릿 아카이브로 간다', async () => {
    renderApp('/studio/handout', { client: createFakeSupabase().client })
    fireEvent.click(within(await screen.findByRole('dialog', { name: '템플릿 선택' })).getByRole('button', { name: '닫기' }))
    expect(await screen.findByRole('heading', { level: 1, name: '핸드아웃' })).toBeInTheDocument()
  })

  it('없는 핸드아웃은 404', async () => {
    renderApp('/studio/handout/nope', { client: createFakeSupabase().client })
    expect(await screen.findByRole('heading', { level: 1, name: '페이지를 찾을 수 없음' })).toBeInTheDocument()
  })
})

describe('기본 편집기와의 연결', () => {
  it('/documents/:id 로 연 스튜디오 형식 핸드아웃은 스튜디오로 넘긴다', async () => {
    const fake = createFakeSupabase()
    const row = fake.control.insertDocument({ type: 'handout', title: '봉인', content: serializeHandout(createHandoutContent('order')) })
    renderApp(`/documents/${row.id}`, { client: fake.client })
    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    expect(screen.getByTestId('location').textContent).toBe(`/studio/handout/${row.id}`)
  })

  it('이전 형식({ text }) 핸드아웃은 기본 편집기에 남고 스튜디오 링크를 보여 준다', async () => {
    const fake = createFakeSupabase()
    const row = fake.control.insertDocument({ type: 'handout', title: '예전', content: { text: '본문' } })
    renderApp(`/documents/${row.id}`, { client: fake.client })
    expect(await screen.findByLabelText('본문')).toHaveValue('본문')
    expect(screen.getByRole('link', { name: /핸드아웃 스튜디오에서 열기/ })).toHaveAttribute('href', `/studio/handout/${row.id}`)
  })
})

describe('서버에서 삭제된 핸드아웃', () => {
  it('이 기기에 남은 변경을 읽기 전용으로 보여 주고, 새 핸드아웃으로 복구하면 스튜디오로 연다', async () => {
    const fake = createFakeSupabase()
    const content = serializeHandout({
      ...createHandoutContent('forest'),
      fields: { ...createHandoutContent('forest').fields, title: '오프라인 연대기', body: '서버에 없는 기록' },
    })
    const row = fake.control.insertDocument({ type: 'handout', title: '숲의 기록', content })
    const services = createTestServices()
    const draft = { title: '숲의 기록 (오프라인)', content }
    await services.store.put({
      userId: 'user-1',
      docId: row.id,
      instanceId: 'closed-tab',
      draft,
      baseVersion: 1,
      revision: 2,
      docType: 'handout',
      conflict: null,
      savedAt: Date.now(),
    })
    fake.control.serverEdit('documents', row.id, { deleted_at: '2026-11-24T00:00:00.000Z' })
    renderApp(`/studio/handout/${row.id}`, { client: fake.client, services })

    expect(await screen.findByText('서버에서 삭제된 문서입니다')).toBeInTheDocument()
    expect(document.querySelector('.hc-canvas')).toBeNull()
    const body = screen.getByLabelText('본문')
    expect(body).toHaveAttribute('readonly')
    expect((body as HTMLTextAreaElement).value).toContain('오프라인 연대기')
    expect((body as HTMLTextAreaElement).value).toContain('서버에 없는 기록')

    fireEvent.click(screen.getByRole('button', { name: '새 문서로 복구' }))
    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    const created = fake.control.tables.documents.find((d) => d.id !== row.id)
    expect(created).toMatchObject({ type: 'handout', title: draft.title, content, deleted_at: null })
    expect(screen.getByTestId('location').textContent).toBe(`/studio/handout/${created?.id}`)
    expect(field('title')).toHaveTextContent('오프라인 연대기')
    await waitFor(async () => expect(await services.store.list('user-1')).toEqual([]))
  })
})
