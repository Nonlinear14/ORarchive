import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase } from '../../test/fakeSupabase'
import { renderApp } from '../../test/renderApp'
import { ROLL20_CODE_STARTERS, roll20CodeContent } from './model'

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  localStorage.clear()
})

const chapter = ROLL20_CODE_STARTERS.find((s) => s.id === 'chapter')!

function docsOf(fake: ReturnType<typeof createFakeSupabase>) {
  return fake.control.tables.documents as { id: string; type: string; title: string; content: { code?: string }; deleted_at: string | null }[]
}

describe('롤꾸코드 편집', () => {
  it('선택 창: 기본 제공 롤꾸를 고르면 사본 문서를 만들어 편집기를 연다', async () => {
    const fake = createFakeSupabase()
    renderApp('/studio/roll20code', { client: fake.client })
    const dialog = await screen.findByRole('dialog')
    for (const s of ROLL20_CODE_STARTERS) expect(within(dialog).getByText(s.title)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: `${chapter.title} — 이 템플릿 사용하기` }))
    expect(await screen.findByRole('complementary', { name: '롤꾸 편집' })).toBeInTheDocument()
    const created = docsOf(fake).filter((d) => d.type === 'roll20code')
    expect(created).toHaveLength(1)
    expect(created[0].title).toBe(chapter.title)
    expect(created[0].content.code).toBe(chapter.code)
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
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved()).toBe(chapter.code.replace('?{챕터명|}', '깊은 밤'))

    fireEvent.click(screen.getByRole('switch', { name: '/desc 서술로 보내기' }))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved().startsWith('/desc ')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /되돌리기/ }))
    await act(() => vi.advanceTimersByTimeAsync(800))
    expect(saved().startsWith('/desc ')).toBe(true)
    vi.useRealTimers()
  })

  it('템플릿 목록: 롤꾸코드는 갈색 칩 · 누르면 편집기로 · 새 롤꾸코드 버튼', async () => {
    const fake = createFakeSupabase()
    fake.control.insertDocument({ type: 'handout', title: '봉인된 편지' })
    fake.control.insertDocument({ type: 'roll20code', title: '판정 버튼 (빨강)', content: roll20CodeContent(ROLL20_CODE_STARTERS[0].code) })
    renderApp('/templates', { client: fake.client })
    const mine = await screen.findByRole('region', { name: '내 템플릿' })
    await waitFor(() => expect(within(mine).getByText(/핸드아웃 1개 · 롤꾸코드 1개/)).toBeInTheDocument())
    expect(within(mine).getByText('롤꾸코드')).toHaveClass('kind-chip', 'tone-brown')
    expect(screen.getByRole('link', { name: /새 롤꾸코드/ })).toHaveAttribute('href', '/studio/roll20code')
    fireEvent.click(within(mine).getByRole('button', { name: '판정 버튼 (빨강) 열기' }))
    expect(await screen.findByRole('complementary', { name: '롤꾸 편집' })).toBeInTheDocument()
  })
})
