import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFakeSupabase } from './test/fakeSupabase'
import { renderApp } from './test/renderApp'

describe('앱 셸', () => {
  it('사이드바 브랜드, 내비 그룹, 상단바, 모바일 내비와 로그인 사용자 프로필을 렌더한다', async () => {
    const { client } = createFakeSupabase()
    renderApp('/', { client })

    const sidebar = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(screen.getAllByText('ORarchive').length).toBeGreaterThan(0)
    expect(screen.getByText('ORPG를 위한 툴 아카이브')).toBeInTheDocument()
    for (const section of ['템플릿 아카이브', '템플릿 에디터', '로그 에디터', '캐릭터 아카이브', '설정']) {
      expect(within(sidebar).getByText(section)).toBeInTheDocument()
    }
    // 예전 WORKSPACE 묶음은 없다
    for (const removed of ['대시보드', '내 프로젝트', '내 보관함', 'WORKSPACE']) {
      expect(within(sidebar).queryByText(removed)).not.toBeInTheDocument()
    }
    // 하위 메뉴는 각각 링크
    for (const [name, href] of [
      ['핸드아웃', '/templates'],
      ['Roll20 코드', '/templates/roll20'],
      ['템플릿 에디터', '/studio/handout'],
      ['Roll20 로그 편집', '/studio/log/roll20'],
      ['코코포리아 로그 편집', '/studio/log/ccfolia'],
      ['캐릭터 아카이브', '/characters'],
      ['계정 설정', '/settings'],
    ]) {
      expect(within(sidebar).getByRole('link', { name })).toHaveAttribute('href', href)
    }
    // 하위 메뉴가 있는 상위 메뉴 제목은 링크가 아니다
    expect(within(sidebar).queryByRole('link', { name: '템플릿 아카이브' })).not.toBeInTheDocument()
    expect(within(sidebar).queryByRole('link', { name: '로그 에디터' })).not.toBeInTheDocument()
    expect(within(sidebar).getByRole('switch', { name: /화면 전환/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '검색' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '알림' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '모바일 메뉴' }).querySelectorAll('a')).toHaveLength(5)

    // Google 이름(프로필 행이 없으면 자동 생성) + 이니셜 아바타
    expect(await screen.findByRole('button', { name: '달빛 기록자 계정 메뉴' })).toBeInTheDocument()
    // 사이드바 아래 계정 칸은 없다 (계정은 오른쪽 위 프로필 버튼 · 설정 › 계정 설정)
    expect(screen.queryByTitle('달빛 기록자 · 계정 설정')).not.toBeInTheDocument()
    expect(screen.getByText('내 클라우드 공간')).toBeInTheDocument()
  })
})

describe('접힌 사이드바 (≤1050px)', () => {
  it('상위 메뉴 아이콘만 보이고, 누르면 하위 메뉴 말풍선을 띄운다', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('1050'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    try {
      renderApp('/', { client: createFakeSupabase().client })
      const sidebar = await screen.findByRole('navigation', { name: '주 메뉴' })
      // 하위 메뉴는 처음엔 보이지 않는다
      expect(within(sidebar).queryByRole('link', { name: 'Roll20 코드' })).not.toBeInTheDocument()
      const archive = within(sidebar).getByRole('button', { name: '템플릿 아카이브' })
      expect(archive).toHaveAttribute('aria-expanded', 'false')

      fireEvent.click(archive)
      expect(archive).toHaveAttribute('aria-expanded', 'true')
      const bubble = within(sidebar).getByRole('group', { name: '템플릿 아카이브' })
      fireEvent.click(within(bubble).getByRole('link', { name: 'Roll20 코드' }))
      expect(await screen.findByRole('heading', { level: 1, name: 'Roll20 코드' })).toBeInTheDocument()
      expect(within(sidebar).queryByRole('group', { name: '템플릿 아카이브' })).not.toBeInTheDocument()
      // 현재 화면이 속한 상위 메뉴가 활성 표시된다
      expect(within(sidebar).getByRole('button', { name: '템플릿 아카이브' })).toHaveClass('active')

      // Esc 로 닫힘, 설정 말풍선에는 테마 토글
      fireEvent.click(within(sidebar).getByRole('button', { name: '설정' }))
      expect(within(sidebar).getByRole('switch', { name: /화면 전환/ })).toBeInTheDocument()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(within(sidebar).queryByRole('switch')).not.toBeInTheDocument()
      // 하위 메뉴가 없는 상위 메뉴는 그대로 링크
      expect(within(sidebar).getByRole('link', { name: '템플릿 에디터' })).toHaveAttribute('href', '/studio/handout')
    } finally {
      window.matchMedia = original
    }
  })
})

describe('라우트 (로그인 상태)', () => {
  // [경로, 화면 제목, 브레드크럼, 사이드바에서 활성화되는 메뉴(없으면 null)]
  const cases: [string, string, string, string | null][] = [
    ['/', '홈', '홈', null],
    ['/templates', '핸드아웃', '핸드아웃', '핸드아웃'],
    ['/templates/roll20', 'Roll20 코드', 'Roll20 코드', 'Roll20 코드'],
    ['/studio/handout', '템플릿 에디터', '템플릿 에디터', '템플릿 에디터'],
    ['/studio/log/roll20', 'Roll20 로그 편집', 'Roll20 로그 편집', 'Roll20 로그 편집'],
    ['/studio/log/ccfolia', '코코포리아 로그 편집', '코코포리아 로그 편집', '코코포리아 로그 편집'],
    ['/characters', '캐릭터 아카이브', '캐릭터 아카이브', '캐릭터 아카이브'],
    ['/settings', '계정 설정', '계정 설정', '계정 설정'],
  ]

  it.each(cases)('%s → "%s" 제목·브레드크럼·활성 메뉴', async (path, heading, crumb, activeLabel) => {
    const { client } = createFakeSupabase()
    renderApp(path, { client })

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: '현재 위치' })
    expect(within(crumbs).getByText(crumb)).toBeInTheDocument()

    const sidebar = screen.getByRole('navigation', { name: '주 메뉴' })
    if (activeLabel) expect(within(sidebar).getByRole('link', { current: 'page' })).toHaveTextContent(activeLabel)
    else expect(within(sidebar).queryByRole('link', { current: 'page' })).not.toBeInTheDocument()
  })

  it('내 보관함(/library) 주소는 없어졌다', async () => {
    renderApp('/library', { client: createFakeSupabase().client })
    expect(await screen.findByRole('heading', { level: 1, name: '페이지를 찾을 수 없음' })).toBeInTheDocument()
  })

  it('예전 /studio/log 주소는 Roll20 로그 편집으로 보낸다', async () => {
    const { client } = createFakeSupabase()
    renderApp('/studio/log', { client })

    expect(await screen.findByRole('heading', { level: 1, name: 'Roll20 로그 편집' })).toBeInTheDocument()
  })

  it('알 수 없는 경로는 404 페이지를 보여준다 (로그인 불필요)', async () => {
    const { client } = createFakeSupabase({ user: null })
    renderApp('/no-such-page', { client })

    expect(await screen.findByRole('heading', { level: 1, name: '페이지를 찾을 수 없음' })).toBeInTheDocument()
  })
})

describe('로그인 가드', () => {
  it.each(['/templates', '/settings', '/studio/handout', '/documents/doc-1', '/templates?q=1'])(
    '비로그인으로 %s 에 오면 /login?next= 로 보낸다',
    async (path) => {
      const { client } = createFakeSupabase({ user: null })
      renderApp(path, { client })

      expect(await screen.findByRole('heading', { level: 1, name: '이야기를 이어갈 시간' })).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent(`/login?next=${encodeURIComponent(path)}`)
    },
  )

  it('비로그인으로 / 에 오면 next 없이 /login 으로 보낸다', async () => {
    const { client } = createFakeSupabase({ user: null })
    renderApp('/', { client })

    expect(await screen.findByRole('heading', { level: 1, name: '이야기를 이어갈 시간' })).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe('/login')
  })

  it('OAuth 오류로 돌아오면 오류를 로그인 화면에 보여주고, next 에 콜백 파라미터를 싣지 않는다', async () => {
    window.history.replaceState(null, '', '/?error=access_denied&error_description=User+cancelled')
    try {
      const { client } = createFakeSupabase({ user: null })
      renderApp('/?error=access_denied&error_description=User+cancelled', { client })

      expect(await screen.findByRole('alert')).toHaveTextContent('User cancelled')
      expect(screen.getByTestId('location').textContent).toBe('/login')
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

  it('세션 확인 중에는 로딩 상태를 보여주고, 확인되면 화면을 연다', async () => {
    const { client } = createFakeSupabase({ sessionDelayMs: 30 })
    renderApp('/settings', { client })

    expect(screen.getByRole('status')).toHaveTextContent('로그인 상태를 확인하는 중')
    expect(await screen.findByRole('heading', { level: 1, name: '계정 설정' })).toBeInTheDocument()
  })

  it('Supabase 설정이 없으면 보호된 화면 대신 설정 안내를 보여준다 (크래시 없음)', () => {
    renderApp('/settings', { client: null })

    expect(screen.getByRole('heading', { level: 1, name: '서버 연결 설정 필요' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('VITE_SUPABASE_URL')
  })
})

describe('basename="/ORarchive" (GitHub Pages)', () => {
  it('basename 아래 경로를 해석하고, 링크에 basename 을 붙인다', async () => {
    const { client } = createFakeSupabase()
    renderApp('/ORarchive/settings', { client, basename: '/ORarchive' })

    expect(await screen.findByRole('heading', { level: 1, name: '계정 설정' })).toBeInTheDocument()
    const sidebar = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(screen.getAllByRole('link', { name: 'ORarchive 홈으로 이동' })[0]).toHaveAttribute('href', '/ORarchive')
    expect(within(sidebar).getByRole('link', { name: '핸드아웃' })).toHaveAttribute('href', '/ORarchive/templates')
  })

  it('basename 아래에서도 비로그인 사용자를 /ORarchive/login 으로 보낸다', async () => {
    const { client } = createFakeSupabase({ user: null })
    renderApp('/ORarchive/settings', { client, basename: '/ORarchive' })

    expect(await screen.findByRole('heading', { level: 1, name: '이야기를 이어갈 시간' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/login?next=%2Fsettings')
  })
})
