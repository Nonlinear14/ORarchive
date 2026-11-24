import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFakeSupabase } from './test/fakeSupabase'
import { renderApp } from './test/renderApp'

describe('앱 셸', () => {
  it('사이드바 브랜드, 내비 그룹, 상단바, 모바일 내비와 로그인 사용자 프로필을 렌더한다', async () => {
    const { client } = createFakeSupabase()
    renderApp('/', { client })

    const sidebar = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(screen.getAllByText('FOLIO').length).toBeGreaterThan(0)
    expect(screen.getByText('TRPG WORKSPACE')).toBeInTheDocument()
    for (const group of ['WORKSPACE', 'CREATIVE STUDIO', 'ACCOUNT']) {
      expect(within(sidebar).getByText(group)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: '검색' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '알림' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '모바일 메뉴' }).querySelectorAll('a')).toHaveLength(5)

    // Google 이름(프로필 행이 없으면 자동 생성) + 이니셜 아바타
    expect(await screen.findByRole('button', { name: '달빛 기록자 계정 메뉴' })).toBeInTheDocument()
    expect(screen.getByTitle('달빛 기록자 · 계정 설정')).toHaveTextContent('달')
  })
})

describe('라우트 (로그인 상태)', () => {
  const cases: [string, string][] = [
    ['/', '대시보드'],
    ['/projects', '내 프로젝트'],
    ['/library', '내 보관함'],
    ['/templates', '템플릿 갤러리'],
    ['/studio/handout', '핸드아웃 스튜디오'],
    ['/studio/log', '로그 스튜디오'],
    ['/characters', '캐릭터 시트'],
    ['/settings', '계정 설정'],
  ]

  it.each(cases)('%s → "%s" 제목·브레드크럼·활성 메뉴', async (path, label) => {
    const { client } = createFakeSupabase()
    renderApp(path, { client })

    expect(await screen.findByRole('heading', { level: 1, name: label })).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: '현재 위치' })
    expect(within(crumbs).getByText(label)).toBeInTheDocument()

    const sidebar = screen.getByRole('navigation', { name: '주 메뉴' })
    const active = within(sidebar).getByRole('link', { current: 'page' })
    expect(active).toHaveTextContent(label)
  })

  it('알 수 없는 경로는 404 페이지를 보여준다 (로그인 불필요)', async () => {
    const { client } = createFakeSupabase({ user: null })
    renderApp('/no-such-page', { client })

    expect(await screen.findByRole('heading', { level: 1, name: '페이지를 찾을 수 없음' })).toBeInTheDocument()
  })
})

describe('로그인 가드', () => {
  it.each(['/library', '/settings', '/studio/handout', '/documents/doc-1', '/library?q=1'])(
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
    renderApp('/library', { client })

    expect(screen.getByRole('status')).toHaveTextContent('로그인 상태를 확인하는 중')
    expect(await screen.findByRole('heading', { level: 1, name: '내 보관함' })).toBeInTheDocument()
  })

  it('Supabase 설정이 없으면 보호된 화면 대신 설정 안내를 보여준다 (크래시 없음)', () => {
    renderApp('/library', { client: null })

    expect(screen.getByRole('heading', { level: 1, name: '서버 연결 설정 필요' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('VITE_SUPABASE_URL')
  })
})

describe('basename="/ORarchive" (GitHub Pages)', () => {
  it('basename 아래 경로를 해석하고, 링크에 basename 을 붙인다', async () => {
    const { client } = createFakeSupabase()
    renderApp('/ORarchive/library', { client, basename: '/ORarchive' })

    expect(await screen.findByRole('heading', { level: 1, name: '내 보관함' })).toBeInTheDocument()
    const sidebar = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(within(sidebar).getByRole('link', { name: /대시보드/ })).toHaveAttribute('href', '/ORarchive')
    expect(within(sidebar).getByRole('link', { name: /내 보관함/ })).toHaveAttribute('href', '/ORarchive/library')
  })

  it('basename 아래에서도 비로그인 사용자를 /ORarchive/login 으로 보낸다', async () => {
    const { client } = createFakeSupabase({ user: null })
    renderApp('/ORarchive/settings', { client, basename: '/ORarchive' })

    expect(await screen.findByRole('heading', { level: 1, name: '이야기를 이어갈 시간' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/login?next=%2Fsettings')
  })
})
