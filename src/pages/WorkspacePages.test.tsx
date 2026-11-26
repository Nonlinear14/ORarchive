import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFakeSupabase } from '../test/fakeSupabase'
import { newHandoutDocument } from '../features/handout/templates'
import { readRecentViews, recordRecentView } from '../lib/recentViews'
import { renderApp } from '../test/renderApp'

function seeded() {
  const fake = createFakeSupabase()
  fake.control.insertDocument({ type: 'handout', title: '달빛 초대장' })
  fake.control.insertDocument({ type: 'handout', title: '봉인된 편지' })
  fake.control.insertDocument({ type: 'log', title: '저택의 세 번째 밤' })
  fake.control.insertDocument({ type: 'character', title: '삭제된 캐릭터', deleted_at: '2026-11-01T00:00:00Z' })
  return fake
}

describe('홈', () => {
  it('최근에 연 핸드아웃 4개만 최근 연 순서로 보여 준다 (삭제·다른 종류 제외)', async () => {
    const fake = createFakeSupabase()
    const ids = ['하나', '둘', '셋', '넷', '다섯'].map(
      (title) => fake.control.insertDocument({ type: 'handout', title, content: newHandoutDocument().content }).id,
    )
    const gone = fake.control.insertDocument({ type: 'handout', title: '지운 핸드아웃', deleted_at: '2026-11-01T00:00:00Z' })
    const log = fake.control.insertDocument({ type: 'log', title: '세션 로그' })
    ids.forEach((id, i) => recordRecentView('user-1', id, 'handout', 1000 + i))
    recordRecentView('user-1', gone.id, 'handout', 5000)
    recordRecentView('user-1', log.id, 'handout', 6000)

    renderApp('/', { client: fake.client })

    const section = await screen.findByRole('region', { name: '템플릿 아카이브' })
    await waitFor(() => expect(within(section).getAllByRole('link', { name: / 열기$/ })).toHaveLength(4))
    const names = within(section)
      .getAllByRole('link', { name: / 열기$/ })
      .map((link) => link.getAttribute('aria-label'))
    expect(names).toEqual(['다섯 열기', '넷 열기', '셋 열기', '둘 열기'])
    expect(within(section).getByRole('link', { name: '다섯 열기' })).toHaveAttribute('href', `/studio/handout/${ids[4]}`)
    expect(within(section).queryByText('지운 핸드아웃')).not.toBeInTheDocument()
  })

  it('에디터 2분할 버튼과 빈 상태를 보여준다', async () => {
    renderApp('/', { client: createFakeSupabase().client })

    expect(await screen.findByText('아직 열어 본 템플릿이 없어요.')).toBeInTheDocument()
    expect(screen.getByText('아직 캐릭터가 없어요.')).toBeInTheDocument()
    const launch = screen.getByRole('region', { name: '에디터 바로가기' })
    expect(within(launch).getByRole('link', { name: /템플릿 에디터/ })).toHaveAttribute('href', '/studio/handout')
    expect(within(launch).getByRole('link', { name: /로그 에디터/ })).toHaveAttribute('href', '/studio/log/roll20')
  })

  it('핸드아웃을 열면 최근 조회에 기록된다', async () => {
    const fake = createFakeSupabase()
    const doc = fake.control.insertDocument({ type: 'handout', title: '달빛 초대장', content: newHandoutDocument().content })
    renderApp(`/studio/handout/${doc.id}`, { client: fake.client })

    await screen.findByRole('textbox', { name: '문서 제목' })
    await waitFor(() => expect(readRecentViews('user-1').map((v) => v.id)).toEqual([doc.id]))
  })
})

describe('화면 모드', () => {
  it('사이드바 토글로 다크모드를 켜고 끈다 (이 기기에 기억)', async () => {
    renderApp('/settings', { client: createFakeSupabase().client })

    const toggle = await screen.findByRole('switch', { name: /라이트모드\/다크모드/ })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('folio-theme')).toBe('dark')
    // 설정 화면의 선택도 같이 바뀐다
    expect(screen.getByRole('radio', { name: '다크모드' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: '라이트모드' }))
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('내 보관함', () => {
  it('제목 검색과 유형 필터', async () => {
    renderApp('/library', { client: seeded().client })
    const table = await screen.findByRole('table', { name: '문서 목록' })
    expect(within(table).getAllByRole('row')).toHaveLength(4) // 머리 + 3

    fireEvent.change(screen.getByPlaceholderText('문서 제목으로 검색'), { target: { value: '편지' } })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(table).toHaveTextContent('봉인된 편지')

    fireEvent.change(screen.getByPlaceholderText('문서 제목으로 검색'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '세션 로그' }))
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(table).toHaveTextContent('저택의 세 번째 밤')
    expect(table).toHaveTextContent('비공개')

    fireEvent.click(screen.getByRole('button', { name: '캐릭터 시트' }))
    expect(screen.getByText('조건에 맞는 문서가 없어요.')).toBeInTheDocument()
  })

  it('새 문서: 유형을 골라 만들면 문서 페이지로 이동한다', async () => {
    const fake = createFakeSupabase()
    renderApp('/library', { client: fake.client })
    await screen.findByText(/아직 만든 문서가 없어요/)

    fireEvent.click(screen.getByRole('button', { name: /새 문서/ }))
    const dialog = screen.getByRole('dialog', { name: '새 문서' })
    fireEvent.click(within(dialog).getByLabelText('캐릭터 시트'))
    fireEvent.change(within(dialog).getByLabelText('제목'), { target: { value: '레이븐 하트' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }))

    expect(await screen.findByLabelText('문서 제목')).toHaveValue('레이븐 하트')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fake.control.tables.documents).toHaveLength(1)
    expect(fake.control.tables.documents[0]).toMatchObject({ type: 'character', title: '레이븐 하트' })
    expect(screen.getByTestId('location').textContent).toMatch(/^\/documents\/doc-/)
  })

  it('삭제는 확인 후 soft delete 하고 목록에서 뺀다', async () => {
    const fake = seeded()
    renderApp('/library', { client: fake.client })
    await screen.findByRole('table', { name: '문서 목록' })

    fireEvent.click(screen.getByRole('button', { name: '봉인된 편지 삭제' }))
    const dialog = screen.getByRole('dialog', { name: '문서를 삭제할까요?' })
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('table', { name: '문서 목록' })).not.toHaveTextContent('봉인된 편지')
    expect(screen.getByRole('table', { name: '문서 목록' })).toHaveTextContent('달빛 초대장')
    const row = fake.control.tables.documents.find((d) => d.title === '봉인된 편지')
    expect(row?.deleted_at).toEqual(expect.any(String))
  })
})

describe('계정 설정', () => {
  it('Google 이메일, 닉네임 변경(검증 포함)', async () => {
    const fake = createFakeSupabase()
    renderApp('/settings', { client: fake.client })

    const account = (await screen.findByRole('heading', { name: '연결된 계정' })).closest('section')!
    expect(within(account).getByText('reader@example.com')).toBeInTheDocument()
    const input = await screen.findByLabelText('닉네임')
    await screen.findByDisplayValue('달빛 기록자')

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByText('닉네임을 입력해 주세요.')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: ' 새벽 서기 ' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('닉네임을 저장했어요.')).toBeInTheDocument()
    expect(fake.control.tables.profiles[0].nickname).toBe('새벽 서기')
    expect(screen.getByRole('button', { name: '새벽 서기 계정 메뉴' })).toBeInTheDocument()
  })

  it('계정 삭제: 확인 문구를 입력해야 켜지고, RPC 호출 후 로그인 화면으로', async () => {
    const fake = createFakeSupabase()
    fake.control.insertDocument({ title: '내 문서' })
    renderApp('/settings', { client: fake.client })

    fireEvent.click(await screen.findByRole('button', { name: '계정 삭제' }))
    const dialog = screen.getByRole('dialog', { name: '계정을 삭제할까요?' })
    const confirm = within(dialog).getByRole('button', { name: '영구 삭제' })
    expect(confirm).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText(/확인을 위해/), { target: { value: '계정 삭제' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    expect(await screen.findByRole('heading', { level: 1, name: '이야기를 이어갈 시간' })).toBeInTheDocument()
    expect(fake.control.rpcCalls).toEqual(['delete_my_account'])
    expect(fake.control.tables.documents).toHaveLength(0)
  })

  it('로그아웃하면 로그인 화면으로 가고 보호된 화면에 다시 들어갈 수 없다', async () => {
    const fake = createFakeSupabase()
    renderApp('/settings', { client: fake.client })

    fireEvent.click(await screen.findByRole('button', { name: /로그아웃/ }))

    expect(await screen.findByRole('heading', { level: 1, name: '이야기를 이어갈 시간' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument()
  })
})
