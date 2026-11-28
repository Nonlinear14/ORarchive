import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase } from '../../test/fakeSupabase'
import { renderApp } from '../../test/renderApp'
import { roll20CodeContent } from './model'
import { MULTI_IMAGE_MACRO, MULTI_MIXED, ROLL20_CODE_SAMPLES } from './testSamples'

/** 수동 저장(2026-11-28): 편집 패널의 저장을 눌러 보낸다 (저장할 것이 없으면 기다리기만) */
async function saveNow() {
  const btn = screen.queryByRole('button', { name: /^저장$/ })
  if (btn && !(btn as HTMLButtonElement).disabled) fireEvent.click(btn)
  await act(() => vi.advanceTimersByTimeAsync(800))
}


afterEach(() => {
  vi.useRealTimers()
  cleanup()
  localStorage.clear()
})

const chapter = ROLL20_CODE_SAMPLES.find((s) => s.id === 'chapter')!

function docsOf(fake: ReturnType<typeof createFakeSupabase>) {
  return fake.control.tables.documents as { id: string; type: string; title: string; content: { code?: string }; deleted_at: string | null }[]
}

describe('롤꾸코드 편집', () => {
  it('선택 창: 기본 제공 롤꾸 없이 내 롤꾸코드만 · 고르면 사본으로 편집기를 연다', async () => {
    const fake = createFakeSupabase()
    fake.control.insertDocument({ type: 'roll20code', title: '챕터', content: roll20CodeContent(chapter.code) })
    fake.control.insertDocument({ type: 'handout', title: '봉인된 편지' })
    renderApp('/studio/roll20code', { client: fake.client })
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('챕터')).toBeInTheDocument()
    expect(within(dialog).queryByText('판정 버튼')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('봉인된 편지')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /새 롤꾸코드/ })).toHaveAttribute('href', '/studio/roll20code/new')
    fireEvent.click(within(dialog).getByRole('button', { name: '챕터 — 이 템플릿 사용하기' }))
    expect(await screen.findByRole('complementary', { name: '롤꾸 편집' })).toBeInTheDocument()
    const codes = docsOf(fake).filter((d) => d.type === 'roll20code')
    expect(codes.map((d) => d.title).sort()).toEqual(['챕터', '챕터 (사본)'])
    expect(codes.every((d) => d.content.code === chapter.code)).toBe(true)
  })

  it('선택 창: 롤꾸코드가 없으면 안내와 새 롤꾸코드 버튼만', async () => {
    const fake = createFakeSupabase()
    renderApp('/studio/roll20code', { client: fake.client })
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/아직 롤꾸코드가 없어요/)).toBeInTheDocument()
    expect(within(dialog).queryAllByRole('article')).toHaveLength(0)
  })

  it('새 롤꾸코드: 저장을 누를 때 처음 만들어 그 편집기로 넘어간다 (붙여 넣기만으로는 만들지 않는다)', async () => {
    const fake = createFakeSupabase()
    const { unmount } = renderApp('/studio/roll20code/new', { client: fake.client })
    const side = await screen.findByRole('complementary', { name: '롤꾸 편집' })
    expect(screen.getByRole('note')).toHaveTextContent('코드 직접 고치기')
    expect(screen.getByText(/아직 저장 전/)).toBeInTheDocument()
    expect(within(side).getByLabelText('롤꾸 코드')).toBeVisible()
    expect(within(side).getByRole('button', { name: /사본으로 저장/ })).toBeDisabled()
    fireEvent.change(within(side).getByLabelText('롤꾸 코드'), { target: { value: chapter.code } })
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(docsOf(fake)).toHaveLength(0)
    fireEvent.click(within(side).getByRole('button', { name: /^저장$/ }))
    await waitFor(() => expect(screen.queryByText(/아직 저장 전/)).not.toBeInTheDocument())
    expect(docsOf(fake)).toHaveLength(1)
    expect(docsOf(fake)[0]).toMatchObject({ title: '새 롤꾸코드', content: { code: chapter.code } })
    expect(screen.getByRole('textbox', { name: '롤꾸코드 이름' })).toHaveValue('새 롤꾸코드')
    unmount()
  })

  it('새 롤꾸코드: 고친 채 나가려 하면 묻고, 삭제를 고르면 남기지 않는다', async () => {
    const fake = createFakeSupabase()
    const { router } = renderApp('/studio/roll20code/new', { client: fake.client })
    const side = await screen.findByRole('complementary', { name: '롤꾸 편집' })
    fireEvent.change(within(side).getByLabelText('롤꾸 코드'), { target: { value: chapter.code } })
    await act(() => router.navigate('/templates'))
    const dialog = await screen.findByRole('dialog', { name: '아직 저장하지 않았어요. 이대로 나갈까요?' })
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/studio/roll20code/new')
    await act(() => router.navigate('/templates'))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/templates'))
    expect(docsOf(fake)).toHaveLength(0)
  })

  it('저장된 롤꾸코드: 나가기 창에서 저장 · 변경 버리기 · 사본으로 저장', async () => {
    const fake = createFakeSupabase()
    const row = fake.control.insertDocument({ type: 'roll20code', title: '챕터', content: roll20CodeContent(chapter.code) })
    const { router } = renderApp(`/studio/roll20code/${row.id}`, { client: fake.client })
    const card = await screen.findByRole('region', { name: '꾸미기' })
    const saved = () => docsOf(fake).find((d) => d.id === row.id)!
    fireEvent.change(within(card).getByLabelText('글자 2'), { target: { value: '깊은 밤' } })
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(saved().content.code).toBe(chapter.code)
    // 변경 버리기 → 원본 그대로
    await act(() => router.navigate('/templates'))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '변경 버리기' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/templates'))
    expect(saved().content.code).toBe(chapter.code)

    // 다시 열어 고치고, 나가기 창에서 저장
    await act(() => router.navigate(`/studio/roll20code/${row.id}`))
    const card2 = await screen.findByRole('region', { name: '꾸미기' })
    fireEvent.change(within(card2).getByLabelText('글자 2'), { target: { value: '깊은 밤' } })
    await act(() => router.navigate('/templates'))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/templates'))
    expect(saved().content.code).toBe(chapter.code.replace('?{챕터명|}', '깊은 밤'))

    // 사본으로 저장: 원본은 그대로, 사본 편집기로
    await act(() => router.navigate(`/studio/roll20code/${row.id}`))
    const card3 = await screen.findByRole('region', { name: '꾸미기' })
    fireEvent.change(within(card3).getByLabelText('글자 2'), { target: { value: '새벽' } })
    fireEvent.click(screen.getByRole('button', { name: /사본으로 저장/ }))
    await waitFor(() => expect(docsOf(fake).filter((d) => d.type === 'roll20code')).toHaveLength(2))
    const copy = docsOf(fake).find((d) => d.type === 'roll20code' && d.id !== row.id)!
    expect(copy).toMatchObject({ title: '챕터 (사본)', content: { code: chapter.code.replace('?{챕터명|}', '새벽') } })
    expect(saved().content.code).toBe(chapter.code.replace('?{챕터명|}', '깊은 밤'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/studio/roll20code/${copy.id}`))
  })

  it('새 롤꾸코드: 그냥 나가면 목록에 남지 않는다', async () => {
    const fake = createFakeSupabase()
    const { unmount } = renderApp('/studio/roll20code/new', { client: fake.client })
    await screen.findByRole('complementary', { name: '롤꾸 편집' })
    unmount()
    expect(docsOf(fake)).toHaveLength(0)
  })

  it('글자 · 같은 색 한꺼번에 · /desc 를 고치면 저장되고, 되돌리기로 돌아간다', async () => {
    const fake = createFakeSupabase()
    const row = fake.control.insertDocument({ type: 'roll20code', title: '챕터', content: roll20CodeContent(chapter.code) })
    renderApp(`/studio/roll20code/${row.id}`, { client: fake.client })
    await screen.findByRole('complementary', { name: '롤꾸 편집' })
    const panel = screen.getByRole('region', { name: '꾸미기' })
    // 질문 예시는 꾸미기 카드 안, 코드 직접 고치기는 오른쪽 패널 (넓은 화면에서 펼침)
    expect(within(panel).getByRole('group', { name: '질문 예시' })).toBeInTheDocument()
    expect(within(screen.getByRole('complementary', { name: '롤꾸 편집' })).getByLabelText('롤꾸 코드')).toBeVisible()
    const saved = () => docsOf(fake).find((d) => d.id === row.id)!.content.code!

    // 질문 예시 → 미리보기에만 (저장하지 않음)
    const queries = screen.getByRole('group', { name: '질문 예시' })
    expect(within(queries).getByLabelText('챕터 숫자')).toBeInTheDocument()

    vi.useFakeTimers()
    fireEvent.change(within(panel).getByLabelText('글자 2'), { target: { value: '깊은 밤' } })
    await saveNow()
    expect(saved()).toBe(chapter.code.replace('?{챕터명|}', '깊은 밤'))

    fireEvent.click(screen.getByRole('switch', { name: '/desc 서술로 보내기' }))
    await saveNow()
    expect(saved().startsWith('/desc ')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /되돌리기/ }))
    await saveNow()
    expect(saved().startsWith('/desc ')).toBe(true)
    vi.useRealTimers()
  })

  it('템플릿 목록: 롤꾸코드는 갈색 칩 · 누르면 편집기로 · 새 롤꾸코드 버튼', async () => {
    const fake = createFakeSupabase()
    fake.control.insertDocument({ type: 'handout', title: '봉인된 편지' })
    fake.control.insertDocument({ type: 'roll20code', title: '판정 버튼 (빨강)', content: roll20CodeContent(ROLL20_CODE_SAMPLES[0].code) })
    renderApp('/templates', { client: fake.client })
    const mine = await screen.findByRole('region', { name: '내 템플릿' })
    await waitFor(() => expect(within(mine).getByText(/핸드아웃 1개 · 롤꾸코드 1개/)).toBeInTheDocument())
    expect(within(mine).getByText('롤꾸코드')).toHaveClass('kind-chip', 'tone-brown')
    expect(screen.getByRole('link', { name: /새 롤꾸코드/ })).toHaveAttribute('href', '/studio/roll20code/new')
    fireEvent.click(within(mine).getByRole('button', { name: '판정 버튼 (빨강) 열기' }))
    expect(await screen.findByRole('complementary', { name: '롤꾸 편집' })).toBeInTheDocument()
  })

  it('여러 메시지: 미리보기에서 메시지를 누르면 그 메시지만 · 글꼴 칸 · 색은 그 메시지 안에서만', async () => {
    const fake = createFakeSupabase()
    const row = fake.control.insertDocument({ type: 'roll20code', title: '세션 카드', content: roll20CodeContent(MULTI_MIXED) })
    renderApp(`/studio/roll20code/${row.id}`, { client: fake.client })
    const card = await screen.findByRole('region', { name: '꾸미기' })
    const saved = () => docsOf(fake).find((d) => d.id === row.id)!.content.code!
    expect(within(card).getByText('전체 메시지 9개')).toBeInTheDocument()
    // 아무것도 고르지 않으면: 내용 · 질문 예시는 비우고 안내, 색은 문서 전체
    expect(within(card).getByText('수정할 열을 선택해 주세요')).toBeInTheDocument()
    expect(within(card).queryByRole('textbox', { name: /글자/ })).not.toBeInTheDocument()
    expect(within(card).queryByRole('group', { name: '질문 예시' })).not.toBeInTheDocument()
    expect(within(card).getByText(/색 1 · 글자/)).toHaveTextContent('3곳')

    const shadow = screen.getByTestId('roll20-chat').shadowRoot!
    fireEvent.click(shadow.querySelector('.message[data-msg="6"] a')!)
    expect(within(card).getByText('메시지 7 편집 중')).toBeInTheDocument()
    expect(shadow.querySelector('.message[data-msg="6"]')).toHaveClass('is-picked')
    expect(within(card).queryByText('수정할 열을 선택해 주세요')).not.toBeInTheDocument()
    expect(within(card).getByLabelText('글자 1')).toHaveValue('PC')
    expect(within(card).getByLabelText('글자 2')).toHaveValue(' ?{PC 이름}')
    // 질문 예시도 이 메시지 것만
    expect(within(within(card).getByRole('group', { name: '질문 예시' })).getAllByRole('textbox')).toHaveLength(1)

    vi.useFakeTimers()
    const font = within(card).getByRole('group', { name: '글자 1 글꼴' })
    fireEvent.change(within(font).getByLabelText('크기'), { target: { value: '15' } })
    await saveNow()
    expect(saved().split('\n')[6]).toContain('color: #F16A66 !important; font-size: 15px;')
    expect(saved().split('\n')[7]).toContain('font-size: 13px;')

    fireEvent.change(within(card).getByLabelText('색 1 HEX 코드'), { target: { value: '#112233' } })
    fireEvent.blur(within(card).getByLabelText('색 1 HEX 코드'))
    await saveNow()
    vi.useRealTimers()
    const lines = saved().split('\n')
    expect(lines[6]).toContain('#112233')
    expect(lines[1]).toContain('#F16A66')
    expect(lines[7]).toContain('#F16A66')

    fireEvent.click(shadow.querySelector('.message[data-msg="5"]')!)
    expect(within(card).getByLabelText('이미지 주소')).toHaveValue('https://imgur.com/csHVgwW.png')
    fireEvent.click(within(card).getByRole('button', { name: '전체 보기' }))
    expect(within(card).getByText('전체 메시지 9개')).toBeInTheDocument()
  })

  it('이미지 매크로: 보기에서 고르면 그 이미지 · 구분선은 고를 수 없다', async () => {
    const fake = createFakeSupabase()
    const row = fake.control.insertDocument({ type: 'roll20code', title: '이미지 매크로', content: roll20CodeContent(MULTI_IMAGE_MACRO) })
    renderApp(`/studio/roll20code/${row.id}`, { client: fake.client })
    const card = await screen.findByRole('region', { name: '꾸미기' })
    const select = within(card).getByLabelText('선택') as HTMLSelectElement
    expect(select.value).toBe('cyTkpDF')
    expect([...select.options].filter((o) => o.disabled).map((o) => o.text)).toEqual(['----------', '----------', '----------'])
    fireEvent.change(select, { target: { value: 'UWWDimV' } })
    const shadow = screen.getByTestId('roll20-chat').shadowRoot!
    expect(shadow.querySelector('img')!.getAttribute('src')).toBe('https://imgur.com/UWWDimV.png')
    expect(within(card).getByText(/주소 안에 질문/)).toBeInTheDocument()
  })
})
