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
    for (const section of ['템플릿 아카이브', '로그 아카이브', '캐릭터 아카이브', '설정']) {
      expect(within(sidebar).getByText(section)).toBeInTheDocument()
    }
    // 예전 WORKSPACE 묶음은 없다
    for (const removed of ['대시보드', '내 프로젝트', '내 보관함', 'WORKSPACE']) {
      expect(within(sidebar).queryByText(removed)).not.toBeInTheDocument()
    }
    // 하위 메뉴는 각각 링크
    for (const [name, href] of [
      ['템플릿 목록', '/templates'],
      ['핸드아웃 편집', '/studio/handout'],
      ['롤꾸코드 편집', '/studio/roll20code'],
      ['로그 목록', '/logs'],
      ['Roll20 로그 편집', '/studio/log/roll20'],
      ['코코포리아 로그 편집', '/studio/log/ccfolia'],
      ['캐릭터 아카이브', '/characters'],
      ['계정 설정', '/settings'],
    ]) {
      expect(within(sidebar).getByRole('link', { name })).toHaveAttribute('href', href)
    }
    // 하위 메뉴가 있는 상위 메뉴 제목은 링크가 아니다
    expect(within(sidebar).queryByRole('link', { name: '템플릿 아카이브' })).not.toBeInTheDocument()
    expect(within(sidebar).queryByRole('link', { name: '로그 아카이브' })).not.toBeInTheDocument()
    // 예전 메뉴 이름은 없다
    for (const removed of ['템플릿 에디터', '로그 에디터', 'Roll20 코드']) expect(within(sidebar).queryByText(removed)).not.toBeInTheDocument()
    // 휴대폰 하단 메뉴는 없다 (사이드바 서랍)
    expect(screen.queryByRole('navigation', { name: '모바일 메뉴' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '다크 모드' })).toBeInTheDocument()
    // 상단 검색 · 알림 버튼은 없고, 그 자리에 사이드바 접고 펴기
    expect(screen.queryByRole('button', { name: '검색' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '알림' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사이드바 접기' })).toHaveAttribute('aria-expanded', 'true')

    // Google 이름(프로필 행이 없으면 자동 생성) + 이니셜 아바타
    expect(await screen.findByRole('button', { name: '달빛 기록자 계정 메뉴' })).toBeInTheDocument()
    // 사이드바 아래 계정 칸은 없다 (계정은 오른쪽 위 프로필 버튼 · 설정 › 계정 설정)
    expect(screen.queryByTitle('달빛 기록자 · 계정 설정')).not.toBeInTheDocument()
    expect(screen.getByText('내 클라우드 공간')).toBeInTheDocument()
  })
})

const nav = () => screen.queryByRole('navigation', { name: '주 메뉴' })

describe('사이드바 접고 펴기 버튼', () => {
  it('넓은 화면: 접으면 사이드바가 완전히 사라진다 · 다시 펴기 · 이 기기에 기억', async () => {
    localStorage.removeItem('folio-sidebar-collapsed')
    renderApp('/', { client: createFakeSupabase().client })
    const sidebar = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(within(sidebar).getByRole('link', { name: '템플릿 목록' })).toBeInTheDocument()
    // 사이드바 버튼은 상단바 왼쪽 주사위 아이콘 · 홈 링크는 사이트 이름과 부제
    const toggle = screen.getByRole('button', { name: '사이드바 접기' })
    expect(toggle.closest('.top-brand')).not.toBeNull()
    expect(toggle.querySelector('.brandmark')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'ORarchive 홈으로 이동' })).toHaveTextContent('ORarchiveORPG를 위한 툴 아카이브')
    expect(screen.getByRole('link', { name: 'ORarchive 홈으로 이동' }).querySelector('.brandmark')).toBeNull()
    fireEvent.click(toggle)
    try {
      expect(document.querySelector('.sidebar')).toHaveClass('is-collapsed')
      expect(nav()).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '템플릿 아카이브' })).not.toBeInTheDocument()
      // 사이트 아이콘 · 이름은 상단바에 그대로
      expect(screen.getByRole('link', { name: 'ORarchive 홈으로 이동' })).toBeVisible()
      expect(localStorage.getItem('folio-sidebar-collapsed')).toBe('1')
    } finally {
      fireEvent.click(screen.getByRole('button', { name: '사이드바 펼치기' }))
    }
    expect(document.querySelector('.sidebar')).not.toHaveClass('is-collapsed')
    expect(nav()).toBeInTheDocument()
    expect(localStorage.getItem('folio-sidebar-collapsed')).toBe('0')
  })
})

describe('휴대폰 (≤750px): 사이드바 서랍', () => {
  it('상단바 버튼으로 열고, 메뉴를 고르거나 바깥을 누르면 닫힌다', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('1050') || query.includes('750'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    try {
      renderApp('/', { client: createFakeSupabase().client })
      await screen.findByRole('button', { name: '사이드바 펼치기' })
      expect(document.querySelector('.sidebar')).toHaveClass('is-collapsed')
      expect(nav()).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '사이드바 펼치기' }))
      expect(document.querySelector('.sidebar')).not.toHaveClass('is-collapsed')
      // 펼친 서랍은 하위 메뉴를 그대로 보여 준다
      fireEvent.click(within(nav()!).getByRole('link', { name: '로그 목록' }))
      expect(await screen.findByRole('heading', { level: 1, name: '로그 목록' })).toBeInTheDocument()
      expect(document.querySelector('.sidebar')).toHaveClass('is-collapsed')
      fireEvent.click(screen.getByRole('button', { name: '사이드바 펼치기' }))
      fireEvent.click(screen.getByRole('button', { name: '메뉴 닫기' }))
      expect(document.querySelector('.sidebar')).toHaveClass('is-collapsed')
    } finally {
      window.matchMedia = original
    }
  })
})

describe('좁은 화면 (≤1050px)', () => {
  it('평소에는 사라져 있고 · 버튼으로 서랍을 연다 (기억하지 않음, 메뉴를 고르면 닫힘)', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('1050'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    try {
      localStorage.removeItem('folio-sidebar-collapsed')
      renderApp('/', { client: createFakeSupabase().client })
      await screen.findByRole('button', { name: '사이드바 펼치기' })
      expect(nav()).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '사이드바 펼치기' }))
      fireEvent.click(within(nav()!).getByRole('link', { name: '롤꾸코드 편집' }))
      expect(await screen.findByRole('heading', { level: 1, name: '롤꾸코드 편집' })).toBeInTheDocument()
      expect(localStorage.getItem('folio-sidebar-collapsed')).toBeNull()
      expect(nav()).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '사이드바 펼치기' }))
      fireEvent.click(screen.getByRole('button', { name: '사이드바 접기' }))
      expect(nav()).not.toBeInTheDocument()
    } finally {
      window.matchMedia = original
    }
  })
})

describe('라우트 (로그인 상태)', () => {
  // [경로, 화면 제목, 브레드크럼, 사이드바에서 활성화되는 메뉴(없으면 null)]
  const cases: [string, string, string, string | null][] = [
    ['/', '홈', '홈', null],
    ['/templates', '템플릿 목록', '템플릿 목록', '템플릿 목록'],
    ['/studio/handout', '핸드아웃 편집', '핸드아웃 편집', '핸드아웃 편집'],
    ['/studio/roll20code', '롤꾸코드 편집', '롤꾸코드 편집', '롤꾸코드 편집'],
    ['/logs', '로그 목록', '로그 목록', '로그 목록'],
    ['/studio/log/roll20', 'Roll20 로그 편집', 'Roll20 로그 편집', 'Roll20 로그 편집'],
    ['/studio/log/ccfolia', '코코포리아 로그 편집', '코코포리아 로그 편집', '코코포리아 로그 편집'],
    ['/characters', '캐릭터 아카이브', '캐릭터 아카이브', '캐릭터 아카이브'],
    ['/settings', '계정 설정', '계정 설정', '계정 설정'],
  ]

  it.each(cases)('%s → "%s" 제목·브레드크럼·활성 메뉴', async (path, heading, crumb, activeLabel) => {
    const { client } = createFakeSupabase()
    renderApp(path, { client })

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
    // 상단바 왼쪽은 경로 대신 사이트 아이콘 · 이름 (홈으로)
    void crumb
    expect(screen.queryByRole('navigation', { name: '현재 위치' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ORarchive 홈으로 이동' })).toHaveAttribute('href', '/')

    const sidebar = screen.getByRole('navigation', { name: '주 메뉴' })
    if (activeLabel) expect(within(sidebar).getByRole('link', { current: 'page' })).toHaveTextContent(activeLabel)
    else expect(within(sidebar).queryByRole('link', { current: 'page' })).not.toBeInTheDocument()
  })

  it('내 보관함(/library) 주소는 없어졌다', async () => {
    renderApp('/library', { client: createFakeSupabase().client })
    expect(await screen.findByRole('heading', { level: 1, name: '페이지를 찾을 수 없음' })).toBeInTheDocument()
  })

  it('예전 /studio/log 주소는 로그 목록으로 보낸다', async () => {
    renderApp('/studio/log', { client: createFakeSupabase().client })
    expect(await screen.findByRole('heading', { level: 1, name: '로그 목록' })).toBeInTheDocument()
  })

  it('예전 /templates/roll20 주소는 템플릿 목록으로 보낸다', async () => {
    renderApp('/templates/roll20', { client: createFakeSupabase().client })
    expect(await screen.findByRole('heading', { level: 1, name: '템플릿 목록' })).toBeInTheDocument()
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
    expect(within(sidebar).getByRole('link', { name: '템플릿 목록' })).toHaveAttribute('href', '/ORarchive/templates')
  })

  it('basename 아래에서도 비로그인 사용자를 /ORarchive/login 으로 보낸다', async () => {
    const { client } = createFakeSupabase({ user: null })
    renderApp('/ORarchive/settings', { client, basename: '/ORarchive' })

    expect(await screen.findByRole('heading', { level: 1, name: '이야기를 이어갈 시간' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/login?next=%2Fsettings')
  })
})
