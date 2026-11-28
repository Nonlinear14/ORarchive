import { SAMPLE_HANDOUT_CONTENT } from '../templates/sample'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentContent } from '../../../lib/documents'
import { createFakeSupabase } from '../../../test/fakeSupabase'
import { createTestServices, renderApp } from '../../../test/renderApp'
import { BlockCanvas } from '../canvas/BlockCanvas'
import * as exportImage from '../exportImage'
import { layoutOf } from '../layout'
import { RECOMMENDED_FIELD_LENGTH, serializeHandout, type HandoutContent } from '../model'
import { createHandoutContent } from '../templates'

/** 수동 저장(2026-11-28): 편집 패널의 저장을 눌러 보낸다 (저장할 것이 없으면 기다리기만) */
async function saveNow() {
  const btn = screen.queryByRole('button', { name: /^저장$/ })
  if (btn && !(btn as HTMLButtonElement).disabled) fireEvent.click(btn)
  await act(() => vi.advanceTimersByTimeAsync(800))
}


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
    // 수동 저장: 저장을 누르기 전까지는 '저장하지 않은 변경 있음'
    expect(chip()).toHaveTextContent('저장하지 않은 변경 있음')
    typeInto(body, '첫 줄\n  둘째 줄')
    // 같은 DOM 노드 — React 가 다시 그리지 않아 커서가 유지된다
    expect(field('title')).toBe(title)
    expect(field('body')).toBe(body)
    expect(title.textContent).toBe('새로운 제목 <b>&')

    await saveNow()
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
    await saveNow()
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
    await saveNow()
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
      await saveNow()

      expect(screen.getByRole('alert')).toHaveTextContent('다른 기기에서 이 문서가 먼저 수정되었어요')
      expect(body).not.toHaveFocus()
      expect(body.textContent).toBe('휴대폰에서 쓴 본문')

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '내 변경으로 덮어쓰기' }))
      })
      await saveNow()
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
    await saveNow()
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
    await saveNow()
    expect(textOf(saved().content, 'body')).toBe(text)
  })

  it('20,000자를 넘는 Phase 1 핸드아웃: 전체를 보여 주고, 다른 칸을 고쳐도 본문은 그대로 저장 (회귀)', async () => {
    const text = longText('예전 본문의 마지막')
    const { saved } = await openStudio({ text })
    expect(field('body').textContent).toBe(text)
    expect(lengthWarning()).toHaveTextContent(`텍스트 블록이 ${text.length.toLocaleString('ko-KR')}자로 권장 한도`)

    vi.useFakeTimers()
    typeInto(field('title'), '고친 제목')
    await saveNow()
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
    await saveNow()
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
    await saveNow()
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
    await saveNow()
    expect(textOf(saved().content, 'body')).toBe('')

    // Enter: 빈 줄은 빈 값이 아니다 — 화면을 지우지 않고, placeholder 도 없다
    browserInput(body, afterEnter)
    const lineNode = body.firstChild
    expect(body.innerHTML).toBe(afterEnter)
    expect(body.matches(':empty')).toBe(false)
    await saveNow()
    expect(textOf(saved().content, 'body')).toBe('\n')
    // 저장 후 동기화 비교(같은 값)도 화면을 다시 쓰지 않는다 → 커서 유지
    expect(body.firstChild).toBe(lineNode)
    expect(body.innerHTML).toBe(afterEnter)

    // 이어서 입력한 글은 빈 줄 다음에
    browserInput(body, afterTyping)
    await saveNow()
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
    await saveNow()
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
    await saveNow()
    expect(textOf(again.saved().content, 'body')).toBe(value)
  })

  it('동기화: 서버 버전의 줄바꿈만 있는 본문을 불러오면 화면에 그대로 (지우지 않음)', async () => {
    const { control, row } = await openStudio()
    control.serverEdit('documents', row.id, { content: withBody('\n\n') })
    vi.useFakeTimers()
    typeInto(field('body'), '내 기기의 본문')
    await saveNow()
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
    const labels = [...panel.querySelectorAll('.panel-section > .field-label:not(.sub), .border-toggle > .field-label')].map((el) => el.textContent)
    expect(labels).toEqual(['배경색', '블록 추가', '편집'])
    expect(within(panel).queryByRole('switch', { name: '테두리 표시' })).not.toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /초기화/ })).toBeInTheDocument()
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
    await saveNow()
    expect(saved().content).toMatchObject({ style: { background: '#d9e4dc' } })
    expect(rowsOf(saved().content)).toBeNull()
    expect(document.querySelector<HTMLElement>('.hb-canvas.editable .hc-frame')!.style.backgroundColor).toBe('rgb(217, 228, 220)')

    // 색 고르기 (로그 에디터 방식): 동그라미 → 색 고르기 창. 끄는 동안(input)은 적용하지 않고, 정해질 때(change) 한 번
    fireEvent.click(screen.getByRole('button', { name: '배경색 (#d9e4dc)' }))
    const picker = screen.getByLabelText('배경색 고르기') as HTMLInputElement
    picker.value = '#445566'
    fireEvent.input(picker)
    await saveNow()
    expect(saved().content).toMatchObject({ style: { background: '#d9e4dc' } })
    picker.value = '#112233'
    fireEvent.change(picker)
    await saveNow()
    expect(saved().content).toMatchObject({ style: { background: '#112233' } })
    expect(screen.queryByLabelText('배경색 고르기')).not.toBeInTheDocument()
    // 기본 색으로: 템플릿 배경색 (style.background 를 뺀다)
    fireEvent.click(screen.getByRole('button', { name: '배경색 (#112233)' }))
    fireEvent.click(screen.getByRole('button', { name: '기본 색으로' }))
    await saveNow()
    expect((saved().content as unknown as { style: object }).style).not.toHaveProperty('background')
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
    await saveNow()
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
    await saveNow()
    expect(blockOf(saved().content, 'f-title')?.style).toMatchObject({ size: 48 })
    // 굵게를 끄면 그 키를 뺀다
    fireEvent.click(screen.getByRole('button', { name: '굵게' }))
    await saveNow()
    expect(blockOf(saved().content, 'f-title')?.style).not.toHaveProperty('bold')
    const before = updates(control)
    // 같은 색을 다시 적용하면 저장하지 않는다
    fireEvent.submit(screen.getByLabelText('글자 색 HEX 코드'))
    await saveNow()
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
    await saveNow()
    expect(blockOf(saved().content, added)).toMatchObject({ type: 'text', text: '새 단서', style: { size: 14 } })

    fireEvent.click(screen.getByRole('button', { name: /선택한 블록 삭제/ }))
    await saveNow()
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
    fireEvent.click(screen.getByRole('button', { name: /이미지 넣기/ }))
    expect(document.querySelector('.hb-canvas.editable img')).toHaveAttribute('src', 'https://cdn.example.com/map.png')
    await saveNow()
    const img = rowsOf(saved().content)!.flatMap((r) => r.blocks).find((b) => b.url)
    expect(img).toMatchObject({ type: 'image', url: 'https://cdn.example.com/map.png' })
    // 대체 텍스트 입력은 없다
    expect(screen.queryByLabelText('대체 텍스트')).not.toBeInTheDocument()
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
    await saveNow()
    expect(blockOf(saved().content, rule.dataset.blockId!)).toMatchObject({ rule: { widthPercent: 70, color: '#335577' } })
    expect(rule.querySelector<HTMLElement>('.hc-rule > span')!.style.background).toBe('rgb(51, 85, 119)')

    // 구분선 추가: 고른 구분선 아래 · 새 구분선 색은 템플릿 구분선 색
    fireEvent.click(screen.getByRole('button', { name: /구분선 추가/ }))
    await saveNow()
    const rows = rowsOf(saved().content)!
    const at = rows.findIndex((r) => r.blocks[0].id === rule.dataset.blockId)
    expect(rows[at + 1].blocks[0]).toMatchObject({ type: 'image', rule: { widthPercent: 100, color: '#335577' } })
    expect(screen.getByText('구분선 편집')).toBeInTheDocument()
  })

  it('구분선 편집: 길이(px, 10–내용 칸 너비) · 굵기(1–10px) · 스타일(실선 · 점선 · 1점 쇄선 · 2점 쇄선)', async () => {
    const { saved } = await openStudio()
    const rule = document.querySelector<HTMLElement>('.hb-canvas.editable [data-block-type="image"]')!
    const id = rule.dataset.blockId!
    fireEvent.pointerDown(rule)
    // 달빛의 초대: 폭 450 − 틀 여백 = 내용 칸 370px (450 − 16·2 − 24·2, 2026-11-27 430→450), 템플릿 구분선은 70% → 259px
    expect(screen.getByLabelText('구분선 길이 (px)')).toHaveValue('259')
    expect(screen.getByLabelText('구분선 굵기 (px)')).toHaveValue('1')
    expect(screen.getByRole('button', { name: /^실선/ })).toHaveAttribute('aria-pressed', 'true')
    vi.useFakeTimers()
    const len = screen.getByLabelText('구분선 길이 (px)')
    fireEvent.change(len, { target: { value: '999' } })
    fireEvent.blur(len)
    expect(screen.getByLabelText('구분선 길이 (px)')).toHaveValue('370')
    fireEvent.click(screen.getByRole('button', { name: '구분선 굵게' }))
    fireEvent.click(screen.getByRole('button', { name: /1점 쇄선/ }))
    await saveNow()
    expect(blockOf(saved().content, id)).toMatchObject({ rule: { length: 370, thickness: 2, style: 'dashdot' } })
    const line = rule.querySelector<HTMLElement>('.hc-rule')!
    expect(line.style.width).toBe('370px')
    expect(line.style.height).toBe('2px')
    expect(line.children.length).toBeGreaterThan(10)
    // 고르기 쉽게 편집 화면에서만 위아래 영역을 넓힌다 (보이는 자리는 그대로)
    expect(rule.style.paddingTop).toBe('12px')
  })

  it('테두리는 없다 (모든 템플릿 · 옵션 없음)', async () => {
    await openStudio()
    const framed = [...document.querySelectorAll<HTMLElement>('.hb-canvas.editable *')].filter((el) => el.style.border && !el.closest('[data-block-id]'))
    expect(framed).toHaveLength(0)
    expect(screen.queryByText(/테두리/)).not.toBeInTheDocument()
  })

  it('초기화: 확인 뒤 템플릿 처음 모양으로 (제목은 그대로) · 되돌리기로 다시 살린다', async () => {
    const { saved } = await openStudio()
    select('f-title')
    vi.useFakeTimers()
    typeInto(field('title'), '고친 제목')
    fireEvent.click(screen.getByRole('button', { name: /글상자 추가/ }))
    fireEvent.click(screen.getByRole('button', { name: /초기화/ }))
    const dialog = screen.getByRole('dialog', { name: '템플릿 처음 모양으로 초기화할까요?' })
    fireEvent.click(within(dialog).getByRole('button', { name: '초기화' }))
    expect(field('title').textContent).toBe('달빛 아래의 초대장')
    await saveNow()
    expect(rowsOf(saved().content)).toBeNull()
    expect(saved().content).toMatchObject({ templateId: 'moonlit', fields: { title: '달빛 아래의 초대장' } })
    expect(screen.getByLabelText('문서 제목')).toHaveValue('달빛 초대장')
    fireEvent.click(screen.getByRole('button', { name: /되돌리기/ }))
    expect(field('title').textContent).toBe('고친 제목')
  })

  it('공백 추가 · 공백 편집(높이 1–200px) · 편집 화면에서만 높이 표시', async () => {
    const { saved } = await openStudio()
    select('f-title')
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: /공백 추가/ }))
    expect(screen.getByText('공백 편집')).toBeInTheDocument()
    expect(screen.getByLabelText('공백 높이 (px)')).toHaveValue('16')
    fireEvent.click(screen.getByRole('button', { name: '공백 높게' }))
    await saveNow()
    const rows = rowsOf(saved().content)!
    const at = rows.findIndex((r) => r.blocks[0].id === 'f-title')
    expect(rows[at + 1].blocks[0]).toMatchObject({ type: 'space', height: 17 })
    const space = block(rows[at + 1].blocks[0].id)
    expect(space.querySelector<HTMLElement>('.hb-space')!.style.height).toBe('17px')
    expect(space).toHaveTextContent('공백 17px')
    // 읽기 전용(JPG 용) 캔버스에는 높이 표시가 없다
    expect(document.querySelector('.jpg-snapshot')).not.toHaveTextContent('공백 17px')
  })

  it('이미지를 빼면 빈 이미지 블록(이미지 고르기)이 남는다', async () => {
    const { saved } = await openStudio()
    fireEvent.click(screen.getByRole('button', { name: /이미지 추가/ }))
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText('이미지 주소 (https)'), { target: { value: 'https://cdn.example.com/a.png' } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 넣기/ }))
    fireEvent.click(screen.getByRole('button', { name: '이미지 빼기' }))
    await saveNow()
    expect(document.querySelector('.hb-canvas.editable .hb-image-empty')).not.toBeNull()
    expect(screen.getByText('이미지 편집')).toBeInTheDocument()
    const img = rowsOf(saved().content)!.at(-1)!.blocks[0]
    expect(img).not.toHaveProperty('url')
    expect(img).not.toHaveProperty('rule')
  })

  it('블록 옮기기 손잡이: ↑ ↓ 키로는 옮기지 않는다 (끌어서만)', async () => {
    const { control } = await openStudio()
    const updates = () => control.calls.filter((c) => c.op === 'update').length
    select('f-signature')
    const handle = screen.getByRole('button', { name: '블록 옮기기' })
    expect(handle).toHaveAttribute('title', '끌어서 옮기기')
    vi.useFakeTimers()
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    await saveNow()
    expect(updates()).toBe(0)
  })

  it('Ctrl(Cmd)+누르기: 같은 종류만 여러 개 고르고, 바꾼 값은 모두에 (되돌리기 한 번) · 다른 종류는 무시', async () => {
    const { saved } = await openStudio()
    select('f-title')
    fireEvent.pointerDown(block('f-body'), { ctrlKey: true })
    fireEvent.pointerDown(block('f-signature'), { metaKey: true })
    // 다른 종류(구분선)는 고르지 않고 지금 선택을 그대로 둔다
    const rule = document.querySelector<HTMLElement>('.hb-canvas.editable [data-block-type="image"]')!
    fireEvent.pointerDown(rule, { ctrlKey: true })
    const picked = () => [...document.querySelectorAll<HTMLElement>('.hb-canvas.editable .is-selected')].map((el) => el.dataset.blockId)
    expect(picked()).toEqual(['f-title', 'f-body', 'f-signature'])
    expect(document.querySelector('.multi-count')).toHaveTextContent('글상자 3개 선택됨')
    // 여러 개를 고르면 옮기기 손잡이는 없다
    expect(screen.queryByRole('button', { name: '블록 옮기기' })).not.toBeInTheDocument()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '글자 크게' }))
    fireEvent.click(screen.getByRole('button', { name: '굵게' }))
    await saveNow()
    // 처음 고른 블록 값(제목 30px)에 맞춰 모두 31px · 굵게
    for (const id of ['f-title', 'f-body', 'f-signature']) expect(blockOf(saved().content, id)?.style).toMatchObject({ size: 31, bold: true })
    // Ctrl+누르기로 빼기
    fireEvent.pointerDown(block('f-body'), { ctrlKey: true })
    expect(picked()).toEqual(['f-title', 'f-signature'])
    // 되돌리기 한 번에 크기 · 굵게가 각각 한 단계 (블록 수와 상관없이)
    fireEvent.click(screen.getByRole('button', { name: /되돌리기/ }))
    expect(field('body').style.fontWeight).toBe('400')
    expect(field('body').style.fontSize).toBe('31px')
    // 고른 블록 모두 삭제
    fireEvent.click(screen.getByRole('button', { name: /선택한 블록 삭제/ }))
    await saveNow()
    expect(blockOf(saved().content, 'f-title')).toBeUndefined()
    expect(blockOf(saved().content, 'f-signature')).toBeUndefined()
    expect(blockOf(saved().content, 'f-body')).toBeDefined()
  })

  it('꾸밈 단축키(Ctrl+B · I · U · D) · 밑줄 · 취소선 버튼: 손잡이로 고른 글상자는 전체에', async () => {
    const { saved } = await openStudio()
    select('f-body')
    expect(screen.getAllByRole('button', { name: /^(굵게|기울임|밑줄|취소선)$/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['굵게', '기울임', '밑줄', '취소선'])
    vi.useFakeTimers()
    fireEvent.keyDown(document.body, { key: 'b', ctrlKey: true })
    fireEvent.keyDown(document.body, { key: 'i', metaKey: true })
    fireEvent.keyDown(document.body, { key: 'u', ctrlKey: true })
    const d = fireEvent.keyDown(document.body, { key: 'd', ctrlKey: true })
    expect(d).toBe(false) // 브라우저 북마크(Ctrl+D) 대신
    await saveNow()
    expect(blockOf(saved().content, 'f-body')?.style).toMatchObject({ bold: true, italic: true, underline: true, strike: true })
    expect(field('body').querySelector('span')!.style.textDecoration).toBe('underline line-through')
    fireEvent.click(screen.getByRole('button', { name: '취소선' }))
    await saveNow()
    expect(blockOf(saved().content, 'f-body')?.style).not.toHaveProperty('strike')
    // 입력칸에서는 브라우저 기본 (가로채지 않는다)
    expect(fireEvent.keyDown(screen.getByLabelText('배경색 HEX 코드'), { key: 'b', ctrlKey: true })).toBe(true)
  })

  it('드래그한 글자에만 꾸밈 (색 · 굵게 · 크기), 정렬은 글상자 전체', async () => {
    const { saved } = await openStudio()
    select('f-title')
    const box = field('title')
    box.focus()
    // "달빛 아래의 초대장" 에서 "아래의" (3–6) 를 고른다
    const r = document.createRange()
    const text = box.querySelector('span')!.firstChild as Text
    r.setStart(text, 3)
    r.setEnd(text, 6)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(r)
    document.dispatchEvent(new Event('selectionchange'))
    expect(await screen.findByText(/드래그한 글자에만 적용돼요/)).toBeInTheDocument()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '굵게' }))
    fireEvent.click(screen.getByRole('button', { name: '글자 크게' }))
    fireEvent.click(screen.getByRole('button', { name: '오른쪽 정렬' }))
    await saveNow()
    const title = blockOf(saved().content, 'f-title') as unknown as { text: string; runs: unknown; style: Record<string, unknown> }
    expect(title.text).toBe('달빛 아래의 초대장')
    expect(title.runs).toEqual([{ t: '달빛 ' }, { t: '아래의', s: { bold: true, size: 31 } }, { t: ' 초대장' }])
    expect(title.style).toMatchObject({ align: 'right', size: 30 })
    expect(title.style).not.toHaveProperty('bold')
    const spans = [...field('title').querySelectorAll('span')]
    expect(spans.map((sp) => sp.textContent)).toEqual(['달빛 ', '아래의', ' 초대장'])
    expect(spans[1].style.fontWeight).toBe('700')
  })

  it('글상자 자간(px, 0.5 단위, −5–20) · 행간(배수, 0.1 단위, 0.8–3) — 가로 정렬 위', async () => {
    const { saved } = await openStudio()
    select('f-body')
    const labels = [...document.querySelectorAll('.rule-tool-label, .field-label.sub')].map((el) => el.textContent)
    expect(labels.indexOf('자간')).toBeLessThan(labels.indexOf('가로 정렬'))
    expect(screen.getByLabelText('자간 (px)')).toHaveValue('0')
    expect(screen.getByLabelText('행간 (글자 크기의 배수)')).toHaveValue('2.2')
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '자간 넓게' }))
    fireEvent.click(screen.getByRole('button', { name: '행간 넓게' }))
    await saveNow()
    expect(blockOf(saved().content, 'f-body')?.style).toMatchObject({ letterSpacing: 0.5, lineHeight: 2.3 })
    expect(field('body').style.letterSpacing).toBe('0.5px')
    expect(field('body').style.lineHeight).toBe('2.3')
    const ls = screen.getByLabelText('자간 (px)')
    fireEvent.change(ls, { target: { value: '-9' } })
    fireEvent.blur(ls)
    expect(screen.getByLabelText('자간 (px)')).toHaveValue('-5')
    const lh = screen.getByLabelText('행간 (글자 크기의 배수)')
    fireEvent.change(lh, { target: { value: '1.26' } })
    fireEvent.blur(lh)
    expect(screen.getByLabelText('행간 (글자 크기의 배수)')).toHaveValue('1.3')
    await saveNow()
    expect(blockOf(saved().content, 'f-body')?.style).toMatchObject({ letterSpacing: -5, lineHeight: 1.3 })
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
    await saveNow()
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
    await saveNow()
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
    await saveNow()
    expect(blockOf(saved().content, 'f-body')?.style).toMatchObject({ align: 'right' })
    expect(block('f-body').style.textAlign).toBe('right')
  })

  it('세로 정렬(위 · 가운데 · 아래): 글상자 · 이미지 편집에 있고, 2열 줄에서 보인다 (롤꾸 복사는 칸의 valign)', async () => {
    const two = {
      ...serializeHandout(createHandoutContent('moonlit')),
      layout: {
        rows: [
          {
            id: 'r',
            blocks: [
              { id: 'a', type: 'text', text: '왼쪽', style: { size: 14, color: '#000000' } },
              { id: 'b', type: 'image', url: 'https://cdn.example.com/x.png', maxWidth: 300 },
            ],
          },
        ],
      },
    }
    const { saved } = await openStudio(two as unknown as DocumentContent)
    select('a')
    expect(screen.getByRole('button', { name: '세로 가운데 정렬' })).toHaveAttribute('aria-pressed', 'true')
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '세로 위 정렬' }))
    select('b')
    fireEvent.click(screen.getByRole('button', { name: '세로 아래 정렬' }))
    await saveNow()
    expect(blockOf(saved().content, 'a')).toMatchObject({ valign: 'top' })
    expect(blockOf(saved().content, 'b')).toMatchObject({ valign: 'bottom' })
    expect(block('a')).toHaveAttribute('data-valign', 'top')
    // 가운데로 돌리면 그 키를 뺀다
    fireEvent.click(screen.getByRole('button', { name: '세로 가운데 정렬' }))
    await saveNow()
    expect(blockOf(saved().content, 'b')).not.toHaveProperty('valign')
  })

  it('2열: 두 블록은 같은 줄 높이 · 여백은 줄에 한 번 · 사이 손잡이의 ← → 키는 아무것도 하지 않는다', async () => {
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
    await saveNow()
    expect(rowsOf(ctx.saved().content)).toEqual(two.layout.rows)
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

describe('템플릿 아카이브 › 템플릿 목록 · 핸드아웃 편집', () => {
  it('핸드아웃 화면에는 "새로 시작"이 없고, 새 핸드아웃 버튼이 템플릿 선택 창을 띄운다', async () => {
    const fake = createFakeSupabase()
    renderApp('/templates', { client: fake.client })
    expect(await screen.findByRole('heading', { level: 1, name: '템플릿 목록' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '새로 시작' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /템플릿으로 시작/ })).not.toBeInTheDocument()

    // 새 계정: 기본 핸드아웃 "핸드아웃 샘플"이 아카이브에 일반 핸드아웃으로 한 번 들어간다
    const mine = await screen.findByRole('region', { name: '내 템플릿' })
    expect(await within(mine).findByRole('button', { name: '핸드아웃 샘플 열기' })).toBeInTheDocument()
    expect(fake.control.tables.documents).toHaveLength(1)
    expect(fake.control.tables.documents[0]).toMatchObject({ type: 'handout', title: '핸드아웃 샘플', content: SAMPLE_HANDOUT_CONTENT })

    fireEvent.click(await screen.findByRole('button', { name: '새 핸드아웃' }))
    const dialog = screen.getByRole('dialog', { name: '템플릿 선택' })
    expect(await within(dialog).findByRole('button', { name: '핸드아웃 샘플 — 이 템플릿 사용하기' })).toBeInTheDocument()
  })

  it('기본 핸드아웃은 지울 수 있고, 지운 뒤에는 다시 생기지 않는다 · 빈 선택 창에는 기본 핸드아웃만 보인다', async () => {
    const fake = createFakeSupabase()
    const sample = fake.control.insertDocument({ type: 'handout', title: '핸드아웃 샘플', content: SAMPLE_HANDOUT_CONTENT })
    sample.deleted_at = new Date().toISOString()
    renderApp('/templates', { client: fake.client })
    const mine = await screen.findByRole('region', { name: '내 템플릿' })
    await waitFor(() => expect(within(mine).getByText(/아직 만든 핸드아웃이 없어요/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '새 핸드아웃' }))
    const dialog = screen.getByRole('dialog', { name: '템플릿 선택' })
    expect(await within(dialog).findByText(/아직 템플릿 목록에 핸드아웃이 없어요/)).toBeInTheDocument()
    // 예전 기본 템플릿 4종은 보이지 않는다
    expect(within(dialog).getAllByRole('article').map((a) => a.querySelector('strong')!.textContent)).toEqual(['핸드아웃 샘플'])
    fireEvent.click(within(dialog).getByRole('button', { name: '핸드아웃 샘플 — 이 템플릿 사용하기' }))
    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    const created = fake.control.tables.documents.find((d) => d.id !== sample.id)!
    expect(screen.getByTestId('location').textContent).toBe(`/studio/handout/${created.id}`)
    expect(created).toMatchObject({ type: 'handout', title: '핸드아웃 샘플', content: SAMPLE_HANDOUT_CONTENT })
    expect(fake.control.tables.documents).toHaveLength(2)
  })

  it('템플릿 목록에서 핸드아웃을 고르면 미리보기 창 없이 바로 원본 편집기 (카드 · 목록 줄 모두)', async () => {
    const fake = createFakeSupabase()
    const original = fake.control.insertDocument({ type: 'handout', title: '잃어버린 연대기', content: serializeHandout(createHandoutContent('forest')) })
    const { router } = renderApp('/templates', { client: fake.client })
    const mine = await screen.findByRole('region', { name: '내 템플릿' })
    fireEvent.click(await within(mine).findByRole('button', { name: '잃어버린 연대기 열기' }))
    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe(`/studio/handout/${original.id}`)
    expect(fake.control.tables.documents.filter((d) => d.type === 'handout' && String(d.title).includes('사본'))).toHaveLength(0)

    await act(() => router.navigate('/templates'))
    const mine2 = await screen.findByRole('region', { name: '내 템플릿' })
    await within(mine2).findByRole('button', { name: '잃어버린 연대기 열기' })
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '보기 방식' })).getByRole('radio', { name: /목록/ }))
    fireEvent.click(within(within(mine2).getByRole('table')).getByRole('button', { name: '잃어버린 연대기' }))
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(`/studio/handout/${original.id}`))
  })

  it('핸드아웃 편집: 저장 · 사본으로 저장 · 나가기 창 · 새 핸드아웃', async () => {
    const fake = createFakeSupabase()
    const stored = { ...serializeHandout(createHandoutContent('forest')), extra: { keep: '저장 값 그대로' } }
    const original = fake.control.insertDocument({ type: 'handout', title: '잃어버린 연대기', content: stored })
    const { router } = renderApp(`/studio/handout/${original.id}`, { client: fake.client })
    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    const row = () => fake.control.tables.documents.find((d) => d.id === original.id)!
    fireEvent.change(screen.getByLabelText('문서 제목'), { target: { value: '고친 연대기' } })
    await act(() => new Promise((r) => setTimeout(r, 30)))
    expect(row().title).toBe('잃어버린 연대기')

    // 사본으로 저장: 고친 내용으로 사본, 원본은 그대로
    fireEvent.click(screen.getByRole('button', { name: /사본으로 저장/ }))
    await waitFor(() => expect(fake.control.tables.documents.filter((d) => d.type === 'handout')).toHaveLength(2))
    const copy = fake.control.tables.documents.find((d) => d.type === 'handout' && d.id !== original.id)!
    expect(copy).toMatchObject({ title: '고친 연대기 (사본)', content: stored })
    expect(row()).toMatchObject({ title: '잃어버린 연대기', version: 1 })
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(`/studio/handout/${copy.id}`))

    // 원본을 다시 열면 저장하지 않은 변경 없이 마지막 저장 그대로
    await act(() => router.navigate(`/studio/handout/${original.id}`))
    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    expect(screen.getByLabelText('문서 제목')).toHaveValue('잃어버린 연대기')

    // 저장 버튼
    fireEvent.change(screen.getByLabelText('문서 제목'), { target: { value: '저장한 연대기' } })
    fireEvent.click(screen.getByRole('button', { name: /^저장$/ }))
    await waitFor(() => expect(row().title).toBe('저장한 연대기'))

    // 새 핸드아웃: 템플릿 선택 창의 버튼 → "새 핸드아웃" 양식, 저장할 때 만든다
    await act(() => router.navigate('/studio/handout'))
    const dialog = await screen.findByRole('dialog', { name: '템플릿 선택' })
    expect(within(dialog).getByRole('link', { name: /새 핸드아웃/ })).toHaveAttribute('href', '/studio/handout/new')
    fireEvent.click(within(dialog).getByRole('link', { name: /새 핸드아웃/ }))
    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    expect(screen.getByLabelText('문서 제목')).toHaveValue('새 핸드아웃')
    expect(within(screen.getByRole('group', { name: '핸드아웃 캔버스' })).getByText('HANDOUT')).toBeInTheDocument()
    const before = fake.control.tables.documents.length
    fireEvent.click(screen.getByRole('button', { name: /^저장$/ }))
    await waitFor(() => expect(fake.control.tables.documents.length).toBe(before + 1))
    expect(fake.control.tables.documents.at(-1)).toMatchObject({ type: 'handout', title: '새 핸드아웃' })
    await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('/new'))
  })

  it('템플릿 선택 창: 내 핸드아웃 목록(최근 수정순) · 카드는 미리보기 · 이름 · 이 템플릿 사용하기 · 이름 검색', async () => {
    const fake = createFakeSupabase()
    fake.control.insertDocument({ type: 'handout', title: '봉인된 편지', content: serializeHandout(createHandoutContent('order')) })
    fake.control.insertDocument({ type: 'handout', title: '달빛 초대장 (사본)', content: serializeHandout(createHandoutContent('moonlit')) })
    fake.control.insertDocument({ type: 'log', title: '세션 1' })
    renderApp('/studio/handout', { client: fake.client })
    const dialog = await screen.findByRole('dialog', { name: '템플릿 선택' })
    const search = within(dialog).getByRole('searchbox', { name: '템플릿 검색' })
    expect(search).toHaveFocus()
    await within(dialog).findByText('봉인된 편지')
    const names = () => within(dialog).queryAllByRole('article').map((a) => a.querySelector('strong')!.textContent)
    expect(names()).toEqual(['달빛 초대장 (사본)', '봉인된 편지'])
    const card = within(dialog).getAllByRole('article')[0]
    expect(within(card).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['이 템플릿 사용하기'])
    expect(card.querySelector('small, .template-themes')).toBeNull()
    expect(within(dialog).queryByText(/기본 템플릿/)).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '편지' } })
    expect(names()).toEqual(['봉인된 편지'])
    fireEvent.change(search, { target: { value: '우주선' } })
    expect(names()).toEqual([])
    expect(within(dialog).getByRole('status')).toHaveTextContent('이름이 맞는 핸드아웃이 없어요')
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

    const mine = await screen.findByRole('region', { name: '내 템플릿' })
    await waitFor(() => expect(within(mine).getByText(/핸드아웃 1개/)).toBeInTheDocument())
    // 기본은 미리보기 카드
    expect(within(mine).getByRole('button', { name: '봉인된 편지 열기' })).toBeInTheDocument()
    expect(within(mine).getByText('핸드아웃', { selector: '.kind-chip' })).toHaveClass('kind-chip')
    expect(within(mine).queryByRole('table')).not.toBeInTheDocument()
    expect(within(mine).queryByText('세션 1')).not.toBeInTheDocument()

    const toggle = screen.getByRole('radiogroup', { name: '보기 방식' })
    fireEvent.click(within(toggle).getByRole('radio', { name: /목록/ }))
    const table = within(mine).getByRole('table', { name: '문서 목록' })
    expect(table).toHaveTextContent('봉인된 편지')
    // 유형은 컬러칩 (핸드아웃 = 녹색), 공개 범위 칸은 그대로
    expect(within(table).getByText('핸드아웃')).toHaveClass('kind-chip', 'tone-green')
    expect(within(table).getByRole('columnheader', { name: '공개 범위' })).toBeInTheDocument()
    expect(table).not.toHaveTextContent('세션 1')
    expect(localStorage.getItem('folio-archive-view')).toBe('list')
  })

  it('삭제는 확인 후 soft delete 하고 목록에서 뺀다 (미리보기·목록 모두)', async () => {
    const fake = createFakeSupabase()
    fake.control.insertDocument({ type: 'handout', title: '봉인된 편지' })
    fake.control.insertDocument({ type: 'handout', title: '달빛 초대장' })
    renderApp('/templates', { client: fake.client })
    const mine = await screen.findByRole('region', { name: '내 템플릿' })

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

  it('/studio/handout(핸드아웃 편집 메뉴): 고르면 사본을 만들어 연다 (원본 그대로)', async () => {
    const fake = createFakeSupabase()
    const stored = serializeHandout(createHandoutContent('forest'))
    const original = fake.control.insertDocument({ type: 'handout', title: '잃어버린 연대기', content: stored })
    renderApp('/studio/handout', { client: fake.client })
    const dialog = await screen.findByRole('dialog', { name: '템플릿 선택' })
    fireEvent.click(await within(dialog).findByRole('button', { name: '잃어버린 연대기 — 이 템플릿 사용하기' }))
    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    const copy = fake.control.tables.documents.find((d) => d.id !== original.id)!
    expect(screen.getByTestId('location').textContent).toBe(`/studio/handout/${copy.id}`)
    expect(copy).toMatchObject({ title: '잃어버린 연대기 (사본)', content: stored })
    expect(fake.control.tables.documents.find((d) => d.id === original.id)!.content).toEqual(stored)
  })

  it('템플릿 선택 창을 닫으면 (바로 들어온 경우) 템플릿 목록으로 간다', async () => {
    renderApp('/studio/handout', { client: createFakeSupabase().client })
    fireEvent.click(within(await screen.findByRole('dialog', { name: '템플릿 선택' })).getByRole('button', { name: '닫기' }))
    expect(await screen.findByRole('heading', { level: 1, name: '템플릿 목록' })).toBeInTheDocument()
  })

  it('없는 핸드아웃은 404', async () => {
    renderApp('/studio/handout/nope', { client: createFakeSupabase().client })
    expect(await screen.findByRole('heading', { level: 1, name: '페이지를 찾을 수 없음' })).toBeInTheDocument()
  })
})

describe('템플릿 목록 · 로그 목록 검색', () => {
  it('템플릿 목록: 이름으로 거르고(대소문자 무시, 미리보기·목록 모두) 개수는 "n개 중 m개"', async () => {
    const fake = createFakeSupabase()
    fake.control.insertDocument({ type: 'handout', title: 'Moon 초대장' })
    fake.control.insertDocument({ type: 'handout', title: '봉인된 편지' })
    renderApp('/templates', { client: fake.client })
    const mine = await screen.findByRole('region', { name: '내 템플릿' })
    await within(mine).findByRole('button', { name: '봉인된 편지 열기' })
    const search = within(mine).getByRole('searchbox', { name: '템플릿 목록 검색' })
    fireEvent.change(search, { target: { value: 'moon' } })
    expect(within(mine).getByText(/템플릿 2개 중 1개/)).toBeInTheDocument()
    expect(within(mine).getByRole('button', { name: 'Moon 초대장 열기' })).toBeInTheDocument()
    expect(within(mine).queryByRole('button', { name: '봉인된 편지 열기' })).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '보기 방식' })).getByRole('radio', { name: /목록/ }))
    expect(within(mine).getByRole('table')).not.toHaveTextContent('봉인된 편지')
    fireEvent.change(search, { target: { value: '우주선' } })
    expect(within(mine).getByRole('status')).toHaveTextContent('이름이 맞는 템플릿이 없어요')
    fireEvent.change(search, { target: { value: '' } })
    expect(within(mine).getByText(/핸드아웃 2개 ·/)).toBeInTheDocument()
  })

  it('로그 목록: 이름으로 거른다', async () => {
    const fake = createFakeSupabase()
    fake.control.insertDocument({ type: 'log', title: '안개 낀 도서관' })
    fake.control.insertDocument({ type: 'log', title: '세션 2' })
    renderApp('/logs', { client: fake.client })
    const search = await screen.findByRole('searchbox', { name: '로그 목록 검색' })
    fireEvent.change(search, { target: { value: '도서관' } })
    const table = screen.getByRole('table', { name: '문서 목록' })
    expect(table).toHaveTextContent('안개 낀 도서관')
    expect(table).not.toHaveTextContent('세션 2')
    expect(screen.getByText(/로그 2개 중 1개/)).toBeInTheDocument()
    fireEvent.change(search, { target: { value: '없는 이름' } })
    expect(screen.getByRole('status')).toHaveTextContent('이름이 맞는 로그가 없어요')
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
    // 핸드아웃은 복구만 (글자만 복사하면 꾸밈·배치가 빠지므로 "내용 복사" 없음)
    expect(screen.queryByRole('button', { name: '내용 복사' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '새 문서로 복구' }))
    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    const created = fake.control.tables.documents.find((d) => d.id !== row.id)
    expect(created).toMatchObject({ type: 'handout', title: draft.title, content, deleted_at: null })
    expect(screen.getByTestId('location').textContent).toBe(`/studio/handout/${created?.id}`)
    expect(field('title')).toHaveTextContent('오프라인 연대기')
    await waitFor(async () => expect(await services.store.list('user-1')).toEqual([]))
  })
})
