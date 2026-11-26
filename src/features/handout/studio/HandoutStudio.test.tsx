import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentContent } from '../../../lib/documents'
import { createFakeSupabase } from '../../../test/fakeSupabase'
import { createTestServices, renderApp } from '../../../test/renderApp'
import { HandoutCanvas } from '../canvas/HandoutCanvas'
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

const field = (key: string) => document.querySelector<HTMLElement>(`[data-hfield="${key}"]`)!
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
    expect(field('title')).toHaveAttribute('aria-label', '제목')
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
    expect(saved().content).toMatchObject({
      templateId: 'moonlit',
      fields: { title: '새로운 제목 <b>&', body: '첫 줄\n  둘째 줄' },
    })
    expect(field('title')).toBe(title)
  })

  it('한 줄 칸: Enter 는 다음 칸으로, 줄바꿈은 공백으로 / 다 지우면 빈 값(placeholder)', async () => {
    const { saved } = await openStudio()
    field('cap').focus()
    fireEvent.keyDown(field('cap'), { key: 'Enter' })
    expect(document.activeElement).toBe(field('title'))
    fireEvent.keyDown(field('title'), { key: 'Enter' })
    expect(document.activeElement).toBe(field('body'))

    vi.useFakeTimers()
    typeInto(field('signature'), '줄\n바꿈')
    typeInto(field('cap'), '\n')
    expect(field('cap').textContent).toBe('')
    expect(field('cap')).toHaveAttribute('data-ph', '영문 장식 문구')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved().content).toMatchObject({ fields: { signature: '줄 바꿈', cap: '' } })
  })

  it('붙여넣기는 평문만, 한 줄 칸에서는 줄바꿈을 공백으로', async () => {
    const { saved } = await openStudio()
    const title = field('title')
    title.textContent = ''
    vi.useFakeTimers()
    fireEvent.paste(title, {
      clipboardData: { getData: (type: string) => (type === 'text/plain' ? '붙인\n  제목' : '<b>x</b>') },
    })
    expect(title.textContent).toBe('붙인 제목')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved().content).toMatchObject({ fields: { title: '붙인 제목' } })
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
    expect((saved().content as unknown as { fields: Record<string, string> }).fields.body).toBe(text)
    expect(field('body')).toBe(body)
    expect(lengthWarning()).toHaveTextContent(
      `본문이 ${text.length.toLocaleString('ko-KR')}자로 권장 한도(${RECOMMENDED_FIELD_LENGTH.toLocaleString('ko-KR')}자)를 넘습니다.`,
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
    expect((saved().content as unknown as { fields: Record<string, string> }).fields.body).toBe(text)
  })

  it('20,000자를 넘는 Phase 1 핸드아웃: 전체를 보여 주고, 다른 칸을 고쳐도 본문은 그대로 저장 (회귀)', async () => {
    const text = longText('예전 본문의 마지막')
    const { saved } = await openStudio({ text })
    expect(field('body').textContent).toBe(text)
    expect(lengthWarning()).toHaveTextContent(`본문이 ${text.length.toLocaleString('ko-KR')}자로 권장 한도`)

    vi.useFakeTimers()
    typeInto(field('title'), '고친 제목')
    await act(() => vi.advanceTimersByTimeAsync(800))
    const fields = (saved().content as unknown as { fields: Record<string, string> }).fields
    expect(fields.title).toBe('고친 제목')
    expect(fields.body).toBe(text)
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

  it('한 줄 칸에 가운데 줄바꿈이 들어오면 화면도 저장 값(공백)으로 맞춘다', async () => {
    const { saved } = await openStudio()
    vi.useFakeTimers()
    typeInto(field('title'), '둘로\n나뉜 제목  ')
    expect(field('title').textContent).toBe('둘로 나뉜 제목  ')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved().content).toMatchObject({ fields: { title: '둘로 나뉜 제목  ' } })
  })

  it('공백만 있는 칸도 그대로 저장된다', async () => {
    const { saved } = await openStudio()
    vi.useFakeTimers()
    typeInto(field('signature'), '   ')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(field('signature').textContent).toBe('   ')
    expect(saved().content).toMatchObject({ fields: { signature: '   ' } })
  })
})

describe('핸드아웃 스튜디오 — 줄바꿈만 있는 본문 (회귀: 빈 본문에서 Enter 한 빈 줄이 지워지던 문제)', () => {
  /** 브라우저가 실제로 만드는 DOM 으로 바꾸고 input 이벤트 (값은 editableText.test.ts 의 Chrome 실측) */
  function browserInput(el: HTMLElement, html: string) {
    el.innerHTML = html
    fireEvent.input(el)
  }
  const fieldsOf = (content: unknown) => (content as { fields: Record<string, string> }).fields
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
    expect(fieldsOf(saved().content).body).toBe('')

    // Enter: 빈 줄은 빈 값이 아니다 — 화면을 지우지 않고, placeholder 도 없다
    browserInput(body, afterEnter)
    const lineNode = body.firstChild
    expect(body.innerHTML).toBe(afterEnter)
    expect(body.matches(':empty')).toBe(false)
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(fieldsOf(saved().content).body).toBe('\n')
    // 저장 후 동기화 비교(같은 값)도 화면을 다시 쓰지 않는다 → 커서 유지
    expect(body.firstChild).toBe(lineNode)
    expect(body.innerHTML).toBe(afterEnter)

    // 이어서 입력한 글은 빈 줄 다음에
    browserInput(body, afterTyping)
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(fieldsOf(saved().content).body).toBe('\nabc')
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
    expect(fieldsOf(saved().content)).toMatchObject({ title: '다른 칸', body: value })
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
    expect(fieldsOf(again.saved().content).body).toBe(value)
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
    const { container } = render(<HandoutCanvas content={content} />)
    const bodyEl = Array.from(container.querySelectorAll('.hc-field')).find((el) => el.textContent === '\n\n\n')
    expect(bodyEl).toBeDefined()
  })
})

describe('핸드아웃 스튜디오 — 한 줄 칸에 저장돼 있던 줄바꿈 (리뷰 회귀: 입력하면 원래 있던 줄바꿈이 공백으로 바뀌거나 지워지던 문제)', () => {
  // 다른 기기 · 이전 버전에서 온 값: 한 줄 칸(머리 문구 · 제목 · 서명)에 가운데 · 끝 줄바꿈, 줄바꿈만 있는 값
  const STORED = { cap: 'A\nB', title: '\n', body: '본문', signature: '서명\n' }
  const fieldsOf = (content: unknown) => (content as { fields: Record<string, string> }).fields
  const open = () => openStudio(serializeHandout({ ...createHandoutContent('moonlit'), fields: STORED }))

  /** 브라우저가 글자 offset 자리에 글을 넣은 것처럼 (입력 · 끌어다 놓기 · IME): 글자 노드를 고치고 input 이벤트 */
  function insertAt(el: HTMLElement, offset: number, text: string) {
    ;(el.firstChild as Text).insertData(offset, text)
    fireEvent.input(el)
  }

  function caretAt(el: HTMLElement, offset: number) {
    el.focus()
    const range = document.createRange()
    range.setStart(el.firstChild!, offset)
    range.collapse(true)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
  }

  it('저장된 줄바꿈이 그대로 보이고, 한 글자를 입력하면 그 글자만 더해 저장한다 (원래 있던 줄바꿈 · 끝 줄바꿈은 그대로)', async () => {
    const { saved } = await open()
    // 줄바꿈으로 끝나는 값은 마지막 빈 줄이 보이도록 \n 하나를 더 그린다
    expect(field('cap').textContent).toBe('A\nB')
    expect(field('title').textContent).toBe('\n\n')
    expect(field('signature').textContent).toBe('서명\n\n')

    vi.useFakeTimers()
    const title = field('title')
    const titleText = title.firstChild
    insertAt(title, 0, 'x')
    insertAt(field('cap'), 3, 'Z')
    insertAt(field('signature'), 2, '!')
    // 화면을 다시 그리지 않는다 (같은 글자 노드 — 커서 유지)
    expect(title.firstChild).toBe(titleText)
    expect(title.textContent).toBe('x\n\n')
    expect(field('cap').textContent).toBe('A\nBZ')
    expect(field('signature').textContent).toBe('서명!\n\n')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(fieldsOf(saved().content)).toEqual({ cap: 'A\nBZ', title: 'x\n', body: '본문', signature: '서명!\n' })

    // 저장된 줄바꿈 뒤(빈 줄)에 입력해도 그 글자만
    insertAt(field('title'), 2, 'y')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(fieldsOf(saved().content).title).toBe('x\ny')
  })

  it('줄바꿈이 든 글을 붙여 넣으면 붙여 넣은 글의 줄바꿈만 공백으로 — 칸에 있던 줄바꿈은 그대로', async () => {
    const { saved } = await open()
    const cap = field('cap')
    caretAt(cap, 1)
    vi.useFakeTimers()
    fireEvent.paste(cap, {
      clipboardData: { getData: (type: string) => (type === 'text/plain' ? '붙인\n  글\n' : '<b>붙인</b>') },
    })
    expect(cap.textContent).toBe('A붙인 글\nB')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(fieldsOf(saved().content)).toEqual({ ...STORED, cap: 'A붙인 글\nB' })
  })

  it('끌어다 놓기 · IME 처럼 keydown/paste 를 거치지 않고 들어온 줄바꿈도 그 글에서만 뺀다 (화면도 맞추고, 커서는 넣은 글 바로 뒤)', async () => {
    const { saved } = await open()
    vi.useFakeTimers()
    const cap = field('cap')
    cap.focus()
    // 브라우저가 끌어다 놓은 "놓인\n글" 을 넣은 화면: "A놓인\n글\nB"
    insertAt(cap, 1, '놓인\n글')
    expect(cap.textContent).toBe('A놓인 글\nB')
    expect(window.getSelection()!.anchorNode).toBe(cap.firstChild)
    expect(window.getSelection()!.anchorOffset).toBe('A놓인 글'.length)

    // IME 가 넣은 Enter: 저장돼 있던 끝 줄바꿈 뒤의 새 줄바꿈만 막는다 (공백도 남기지 않음)
    const signature = field('signature')
    insertAt(signature, 3, '\n')
    expect(signature.textContent).toBe('서명\n\n')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(fieldsOf(saved().content)).toEqual({ ...STORED, cap: 'A놓인 글\nB' })
  })

  it('Enter 는 그대로 다음 칸으로 (줄바꿈을 넣지 않고 저장된 값도 건드리지 않음)', async () => {
    const { control } = await open()
    vi.useFakeTimers()
    field('cap').focus()
    fireEvent.keyDown(field('cap'), { key: 'Enter' })
    expect(document.activeElement).toBe(field('title'))
    expect(field('cap').textContent).toBe('A\nB')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(control.calls.filter((c) => c.op === 'update')).toHaveLength(0)
  })
})

describe('핸드아웃 스튜디오 — 디자인 패널', () => {
  it('템플릿을 바꾸면 공통 필드(제목·본문)는 유지하고 새 필드가 생긴다', async () => {
    const { saved } = await openStudio()
    vi.useFakeTimers()
    typeInto(field('title'), '나의 사건')
    fireEvent.click(screen.getByRole('button', { name: /오래된 조사 기록/ }))

    expect(document.querySelector('.hc-canvas')).toHaveAttribute('data-template', 'casefile')
    expect(field('title')).toHaveTextContent('나의 사건')
    expect(field('body').textContent).toContain('친애하는 방문객께')
    expect(field('caseNo')).toHaveTextContent('№ 1927-0413')
    expect(screen.getByRole('button', { name: /오래된 조사 기록/ })).toHaveAttribute('aria-pressed', 'true')
    // 저장된 테마(달빛의 초대 'classic')는 그대로 두고, 조사 기록에는 없는 테마라 첫 테마로 그린다
    expect(document.querySelector('.hc-canvas')).toHaveAttribute('data-theme', 'manila')

    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved().content).toMatchObject({ templateId: 'casefile', theme: 'classic', fields: { title: '나의 사건' } })
  })

  it('테마 · 글꼴을 바꿔도 입력한 글은 그대로', async () => {
    const { saved } = await openStudio()
    const title = field('title')
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '한밤 테마' }))
    expect(document.querySelector('.hc-canvas')).toHaveAttribute('data-theme', 'dark')
    fireEvent.click(screen.getByRole('button', { name: '산세리프' }))
    expect(field('title')).toBe(title)
    expect(title).toHaveTextContent('달빛 아래의 초대장')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved().content).toMatchObject({ theme: 'dark', style: { font: 'sans' } })
  })

  it('강조 색: 팔레트 · 직접 입력(검사) · 기본값', async () => {
    const { saved } = await openStudio()
    const input = screen.getByLabelText('강조 색 직접 입력 (hex)')
    fireEvent.change(input, { target: { value: 'red' } })
    fireEvent.click(screen.getByRole('button', { name: '적용' }))
    expect(screen.getByRole('alert')).toHaveTextContent('#RRGGBB 형식의 색을 입력해 주세요')

    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText('강조 색 직접 입력 (hex)'), { target: { value: '#A1B2C3' } })
    fireEvent.click(screen.getByRole('button', { name: '적용' }))
    expect(screen.getByLabelText('강조 색 직접 입력 (hex)')).toHaveValue('#a1b2c3')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved().content).toMatchObject({ style: { accent: '#a1b2c3' } })

    fireEvent.click(screen.getByRole('button', { name: '강조 색 봉랍 빨강' }))
    expect(screen.getByRole('button', { name: '강조 색 봉랍 빨강' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '테마 기본 강조 색' }))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved().content).toMatchObject({ style: {} })
  })

  it('이미지: https 공개 주소만 받는다', async () => {
    const { saved } = await openStudio()
    const url = screen.getByLabelText('이미지 주소 (https)')
    fireEvent.change(url, { target: { value: 'http://example.com/map.png' } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 넣기/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('https:// 로 시작하는 공개 이미지 주소만')
    expect(document.querySelector('.hc-canvas img')).toBeNull()

    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText('이미지 주소 (https)'), { target: { value: 'https://cdn.example.com/map.png' } })
    fireEvent.change(screen.getByLabelText('대체 텍스트'), { target: { value: '저택 지도' } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 넣기/ }))
    expect(document.querySelector('.hc-canvas img')).toHaveAttribute('src', 'https://cdn.example.com/map.png')
    expect(screen.getByRole('img', { name: '저택 지도' })).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved().content).toMatchObject({ image: { url: 'https://cdn.example.com/map.png', alt: '저택 지도' } })

    fireEvent.click(screen.getByRole('button', { name: '이미지 빼기' }))
    expect(document.querySelector('.hc-canvas img')).toBeNull()
  })

  const imageOf = (content: unknown) => (content as { image: { url: string; alt: string } | null }).image
  const updates = (control: ReturnType<typeof createFakeSupabase>['control']) =>
    control.calls.filter((c) => c.op === 'update').length

  it(`${MAX_ALT_LENGTH}자가 넘는 대체 텍스트가 저장된 이미지: 주소만 바꾸면 대체 텍스트는 한 글자도 바뀌지 않는다 (회귀)`, async () => {
    const longAlt = `${'블랙우드 저택 1층과 2층의 방 배치를 그린 낡은 지도, '.repeat(8)}끝  `
    expect(longAlt.length).toBeGreaterThan(MAX_ALT_LENGTH)
    const start = createHandoutContent('moonlit')
    const { saved } = await openStudio(serializeHandout({ ...start, image: { url: 'https://cdn.example.com/old.png', alt: longAlt } }))
    expect(screen.getByLabelText('대체 텍스트')).toHaveValue(longAlt)

    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText('이미지 주소 (https)'), { target: { value: 'https://cdn.example.com/new.png' } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 바꾸기/ }))
    expect(screen.queryByRole('alert')).toBeNull()
    const img = document.querySelector('.hc-canvas img')
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/new.png')
    expect(img).toHaveAttribute('alt', longAlt)
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(imageOf(saved().content)).toEqual({ url: 'https://cdn.example.com/new.png', alt: longAlt })
    expect(screen.getByLabelText('대체 텍스트')).toHaveValue(longAlt)
  })

  it('대체 텍스트를 한도보다 길게 고치면 자르지 않고 한국어로 알리며, 아무것도 바꾸지 않는다', async () => {
    const longAlt = '설'.repeat(MAX_ALT_LENGTH + 30)
    const start = createHandoutContent('moonlit')
    const { saved, control } = await openStudio(
      serializeHandout({ ...start, image: { url: 'https://cdn.example.com/old.png', alt: longAlt } }),
    )
    vi.useFakeTimers()
    const altInput = screen.getByLabelText('대체 텍스트')
    expect(altInput).not.toHaveAttribute('maxlength')
    const edited = `${longAlt}!`
    fireEvent.change(altInput, { target: { value: edited } })
    fireEvent.change(screen.getByLabelText('이미지 주소 (https)'), { target: { value: 'https://cdn.example.com/new.png' } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 바꾸기/ }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      `대체 텍스트는 ${MAX_ALT_LENGTH}자까지 넣을 수 있어요. 지금 ${edited.length}자예요`,
    )
    expect(screen.getByLabelText('대체 텍스트')).toHaveValue(edited) // 입력한 글도 자르지 않는다
    expect(screen.getByLabelText('대체 텍스트')).toHaveAttribute('aria-invalid', 'true')
    expect(document.querySelector('.hc-canvas img')).toHaveAttribute('src', 'https://cdn.example.com/old.png')
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(updates(control)).toBe(0)
    expect(imageOf(saved().content)).toEqual({ url: 'https://cdn.example.com/old.png', alt: longAlt })

    // 줄이면 적용된다 (입력한 그대로 — 앞뒤 공백도 자르지 않음)
    const ok = ` ${'설'.repeat(MAX_ALT_LENGTH - 2)} `
    fireEvent.change(screen.getByLabelText('대체 텍스트'), { target: { value: ok } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /이미지 바꾸기/ }))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(imageOf(saved().content)).toEqual({ url: 'https://cdn.example.com/new.png', alt: ok })
  })

  it('새 이미지의 대체 텍스트도 한도를 넘으면 알리기만 하고 넣지 않는다', async () => {
    await openStudio()
    fireEvent.change(screen.getByLabelText('이미지 주소 (https)'), { target: { value: 'https://cdn.example.com/map.png' } })
    fireEvent.change(screen.getByLabelText('대체 텍스트'), { target: { value: 'a'.repeat(MAX_ALT_LENGTH + 1) } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 넣기/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(`지금 ${MAX_ALT_LENGTH + 1}자예요`)
    expect(document.querySelector('.hc-canvas img')).toBeNull()
  })

  it('대체 텍스트만 고치면 주소는 저장된 값 그대로 쓰고, 아무것도 고치지 않고 누르면 저장하지 않는다', async () => {
    const start = createHandoutContent('moonlit')
    const { saved, control } = await openStudio(
      serializeHandout({ ...start, image: { url: 'https://cdn.example.com/a.png?x=1', alt: '지도' } }),
    )
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: /이미지 바꾸기/ }))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(updates(control)).toBe(0)

    fireEvent.change(screen.getByLabelText('대체 텍스트'), { target: { value: '새 지도' } })
    fireEvent.click(screen.getByRole('button', { name: /이미지 바꾸기/ }))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(imageOf(saved().content)).toEqual({ url: 'https://cdn.example.com/a.png?x=1', alt: '새 지도' })
  })

  it('이미 고른 테마 · 글꼴 · 강조 색을 다시 누르거나, 고치지 않은 색 입력 칸에서 나가도 저장된 값을 건드리지 않는다', async () => {
    const { saved, control } = await openStudio()
    vi.useFakeTimers()
    const themes = screen.getByRole('group', { name: '테마' })
    fireEvent.click(within(themes).getAllByRole('button').find((b) => b.getAttribute('aria-pressed') === 'true')!)
    fireEvent.click(screen.getByRole('button', { name: '세리프' })) // 템플릿 기본 글꼴 (style.font 없음)
    fireEvent.click(screen.getByRole('button', { name: '테마 기본 강조 색' }))
    const hex = screen.getByLabelText('강조 색 직접 입력 (hex)')
    fireEvent.focus(hex)
    fireEvent.blur(hex)
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(updates(control)).toBe(0)
    expect(chip()).toHaveTextContent('저장됨')
    // 글꼴은 여전히 "템플릿 기본값(없음)" — 템플릿을 바꾸면 새 템플릿의 기본 글꼴을 따른다
    expect((saved().content as unknown as { style: object }).style).toEqual({})

    fireEvent.click(screen.getByRole('button', { name: '강조 색 봉랍 빨강' }))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(updates(control)).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: '강조 색 봉랍 빨강' }))
    fireEvent.focus(screen.getByLabelText('강조 색 직접 입력 (hex)'))
    fireEvent.blur(screen.getByLabelText('강조 색 직접 입력 (hex)'))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(updates(control)).toBe(1)
    expect(saved().content).toMatchObject({ style: { accent: '#9b3b2f' } })
  })

  it('템플릿을 바꿨다 돌아오면 그 템플릿에만 있던 칸의 글이 다시 보인다 (지우지 않음)', async () => {
    const { saved } = await openStudio(serializeHandout(createHandoutContent('casefile')))
    vi.useFakeTimers()
    typeInto(field('caseNo'), '№ 내가 쓴 번호')
    fireEvent.click(screen.getByRole('button', { name: /달빛의 초대/ }))
    expect(document.querySelector('[data-hfield="caseNo"]')).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved().content).toMatchObject({ templateId: 'moonlit', fields: { caseNo: '№ 내가 쓴 번호' } })
    fireEvent.click(screen.getByRole('button', { name: /오래된 조사 기록/ }))
    expect(field('caseNo').textContent).toBe('№ 내가 쓴 번호')
  })
})

describe('핸드아웃 스튜디오 — 내보내기', () => {
  it('"Roll20에 복사": 편집한 제목이 담긴 text/html + text/plain 을 복사하고 토스트', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Roll20에 복사' }))
    expect(await screen.findByText(/Roll20용 핸드아웃을 복사했습니다/)).toBeInTheDocument()
    const html = await written[0]['text/html'].text()
    expect(html).toContain('복사할 &lt;제목&gt;')
    expect(html).not.toMatch(/\sclass=/)
    expect(await written[0]['text/plain'].text()).toContain('복사할 <제목>')
  })

  it('복사가 모두 실패하면 한국어 오류 토스트', async () => {
    await openStudio()
    fireEvent.click(screen.getByRole('button', { name: 'Roll20에 복사' }))
    expect(await screen.findByText(/클립보드 접근을 차단했습니다/)).toBeInTheDocument()
  })

  it('HTML 코드 보기(읽기 전용)와 HTML 파일 저장', async () => {
    await openStudio()
    fireEvent.click(screen.getByRole('button', { name: 'HTML 코드 보기' }))
    const dialog = screen.getByRole('dialog', { name: 'HTML 코드 보기' })
    const code = within(dialog).getByLabelText('HTML 코드')
    expect(code).toHaveAttribute('readonly')
    expect((code as HTMLTextAreaElement).value).toMatch(/^<table /)
    fireEvent.click(within(dialog).getByRole('button', { name: '확인' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const urlApi = URL as unknown as Record<string, unknown>
    urlApi.createObjectURL = vi.fn(() => 'blob:folio')
    urlApi.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      fireEvent.click(screen.getByRole('button', { name: 'HTML 파일 저장' }))
      expect(click).toHaveBeenCalledTimes(1)
      expect(urlApi.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
      expect(await screen.findByText('달빛 초대장.html 파일을 저장했습니다.')).toBeInTheDocument()
    } finally {
      click.mockRestore()
      delete urlApi.createObjectURL
      delete urlApi.revokeObjectURL
    }
  })
})

describe('템플릿 갤러리 · 보관함 연결', () => {
  it('분류 필터와 "이 템플릿으로 시작" → 핸드아웃 생성 후 스튜디오', async () => {
    const fake = createFakeSupabase()
    renderApp('/templates', { client: fake.client })
    expect(await screen.findByRole('heading', { level: 1, name: '핸드아웃 템플릿' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(4)

    fireEvent.click(screen.getByRole('button', { name: '미스터리' }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '판타지' }))
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-labelledby'))).toEqual(['tpl-order', 'tpl-forest'])

    fireEvent.click(screen.getByRole('button', { name: '비밀 결사의 인장 템플릿으로 시작' }))
    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    expect(screen.getByTestId('location').textContent).toMatch(/^\/studio\/handout\/doc-/)
    expect(fake.control.tables.documents[0]).toMatchObject({
      type: 'handout',
      title: '봉인된 서약',
      content: { templateId: 'order', theme: 'obsidian' },
    })
    expect(field('seal')).toHaveTextContent('✠')
  })

  it('보관함의 핸드아웃은 스튜디오로, 다른 문서는 기본 편집기로 연결된다', async () => {
    const fake = createFakeSupabase()
    const handout = fake.control.insertDocument({ type: 'handout', title: '봉인된 편지' })
    const log = fake.control.insertDocument({ type: 'log', title: '세션 1' })
    renderApp('/library', { client: fake.client })
    await screen.findByRole('table', { name: '문서 목록' })
    expect(screen.getByRole('link', { name: /봉인된 편지 열기/ })).toHaveAttribute('href', `/studio/handout/${handout.id}`)
    expect(screen.getByRole('link', { name: /세션 1 열기/ })).toHaveAttribute('href', `/documents/${log.id}`)
  })

  it('새 문서 창에서 핸드아웃을 만들면 기본 템플릿으로 스튜디오가 열린다', async () => {
    const fake = createFakeSupabase()
    renderApp('/library?new=handout', { client: fake.client })
    const dialog = await screen.findByRole('dialog', { name: '새 문서' })
    expect(within(dialog).getByRole('link', { name: /템플릿 아카이브에서 고르기/ })).toHaveAttribute('href', '/templates')
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }))

    await screen.findByRole('group', { name: '핸드아웃 캔버스' })
    expect(screen.getByTestId('location').textContent).toMatch(/^\/studio\/handout\/doc-/)
    expect(fake.control.tables.documents[0]).toMatchObject({ title: '달빛 아래의 초대장', content: { templateId: 'moonlit' } })
  })

  it('/studio/handout 은 내 핸드아웃 목록', async () => {
    const fake = createFakeSupabase()
    fake.control.insertDocument({ type: 'handout', title: '봉인된 편지' })
    fake.control.insertDocument({ type: 'log', title: '세션 1' })
    renderApp('/studio/handout', { client: fake.client })
    const table = await screen.findByRole('table', { name: '문서 목록' })
    expect(table).toHaveTextContent('봉인된 편지')
    expect(table).not.toHaveTextContent('세션 1')
    await waitFor(() => expect(screen.getByText(/핸드아웃 1개/)).toBeInTheDocument())
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
