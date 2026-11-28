import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFakeSupabase } from '../test/fakeSupabase'
import { newHandoutDocument } from '../features/handout/templates'
import { readRecentViews, recordRecentView } from '../lib/recentViews'
import { renderApp } from '../test/renderApp'

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

  it('최근에 연 롤꾸코드도 템플릿 아카이브에 보인다 (채팅 모양 미리보기)', async () => {
    const fake = createFakeSupabase()
    const code = fake.control.insertDocument({ type: 'roll20code', title: '판정 버튼', content: { format: 'roll20-code', v: 1, code: '/desc [판정](#" style="color:red")' } })
    recordRecentView('user-1', code.id, 'roll20code', 1000)
    renderApp('/', { client: fake.client })
    const section = await screen.findByRole('region', { name: '템플릿 아카이브' })
    const link = await within(section).findByRole('link', { name: '판정 버튼 열기' })
    expect(link).toHaveAttribute('href', `/studio/roll20code/${code.id}`)
    expect(within(link).getByText(/롤꾸코드 ·/)).toBeInTheDocument()
    await waitFor(() => expect(link.querySelector('[data-testid="roll20-chat"]')).not.toBeNull())
  })

  it('홈 순서: 캐릭터 → 로그 → 템플릿 아카이브, 섹션 아래 편집 바로가기 (코코포리아는 준비 중)', async () => {
    renderApp('/', { client: createFakeSupabase().client })

    expect(await screen.findByText('아직 열어 본 템플릿이 없어요.')).toBeInTheDocument()
    expect(screen.getByText('아직 캐릭터가 없어요.')).toBeInTheDocument()
    expect(screen.getByText('아직 로그가 없어요.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '바로가기' })).not.toBeInTheDocument()
    const order = ['캐릭터 아카이브', '로그 아카이브', '템플릿 아카이브'].map((name) => screen.getByRole('heading', { name, level: 2 }))
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const templates = screen.getByRole('region', { name: '템플릿 아카이브' })
    expect(within(templates).getByRole('link', { name: '핸드아웃 편집' })).toHaveAttribute('href', '/studio/handout')
    expect(within(templates).getByRole('link', { name: '롤꾸코드 편집' })).toHaveAttribute('href', '/studio/roll20code')
    const logs = screen.getByRole('region', { name: '로그 아카이브' })
    expect(within(logs).getByRole('link', { name: 'Roll20 로그 편집' })).toHaveAttribute('href', '/studio/log/roll20')
    expect(within(logs).getByRole('link', { name: /코코포리아 로그 편집/ })).toHaveAttribute('aria-disabled', 'true')
    expect(within(logs).getByRole('link', { name: /코코포리아 로그 편집/ })).not.toHaveAttribute('href')
    expect(within(logs).getByRole('link', { name: /로그 보기/ })).toHaveAttribute('href', '/logs')

    // 사이드바 순서: 캐릭터 → 로그 → 템플릿 → 설정
    const sidebar = screen.getByRole('navigation', { name: '주 메뉴' })
    const titles = ['캐릭터 아카이브', '로그 아카이브', '템플릿 아카이브', '설정'].map((t) => within(sidebar).getAllByText(t)[0])
    for (let i = 1; i < titles.length; i++) expect(titles[i - 1].compareDocumentPosition(titles[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('로그 아카이브: 최근 수정한 로그 4건을 목록으로', async () => {
    const fake = createFakeSupabase()
    ;['하나', '둘', '셋', '넷', '다섯'].forEach((title, i) =>
      fake.control.insertDocument({ type: 'log', title, updated_at: `2026-11-2${i}T00:00:00Z`, content: { format: i === 4 ? 'ccfolia-log' : 'roll20-log' } }),
    )
    fake.control.insertDocument({ type: 'handout', title: '핸드아웃', updated_at: '2026-11-29T00:00:00Z' })
    renderApp('/', { client: fake.client })
    const logs = await screen.findByRole('region', { name: '로그 아카이브' })
    const table = await within(logs).findByRole('table')
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelector('strong, .doc-title, a')?.textContent?.trim())
    expect(names).toHaveLength(4)
    expect(within(table).getByText('다섯')).toBeInTheDocument()
    expect(within(table).queryByText('하나')).not.toBeInTheDocument()
    expect(within(table).queryByText('핸드아웃')).not.toBeInTheDocument()
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
  it('오른쪽 아래 버튼으로 다크모드를 켜고 끈다 (이 기기에 기억) · 사이드바 스위치는 없다', async () => {
    renderApp('/settings', { client: createFakeSupabase().client })

    const toggle = await screen.findByRole('switch', { name: '다크 모드' })
    expect(within(screen.getByRole('navigation', { name: '주 메뉴' })).queryByRole('switch')).not.toBeInTheDocument()
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
