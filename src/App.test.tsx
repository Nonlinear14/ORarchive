import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { App } from './App'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('앱 셸', () => {
  it('사이드바 브랜드, 내비 그룹, 상단바, 모바일 내비를 렌더한다', () => {
    renderAt('/')

    const sidebar = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(screen.getAllByText('FOLIO').length).toBeGreaterThan(0)
    expect(screen.getByText('TRPG WORKSPACE')).toBeInTheDocument()
    for (const group of ['WORKSPACE', 'CREATIVE STUDIO', 'ACCOUNT']) {
      expect(within(sidebar).getByText(group)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: '검색' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '알림' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '모바일 메뉴' }).querySelectorAll('a')).toHaveLength(5)
  })
})

describe('라우트', () => {
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

  it.each(cases)('%s → "%s" 제목·브레드크럼·활성 메뉴', (path, label) => {
    renderAt(path)

    expect(screen.getByRole('heading', { level: 1, name: label })).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: '현재 위치' })
    expect(within(crumbs).getByText(label)).toBeInTheDocument()

    const sidebar = screen.getByRole('navigation', { name: '주 메뉴' })
    const active = within(sidebar).getByRole('link', { current: 'page' })
    expect(active).toHaveTextContent(label)
  })

  it('/login 은 비활성 Google 버튼과 안내 문구만 보여준다', () => {
    renderAt('/login')

    expect(screen.getByRole('heading', { level: 1, name: '이야기를 이어갈 시간' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Google로 계속하기/ })).toBeDisabled()
    expect(screen.queryByText(/kakao|카카오/i)).not.toBeInTheDocument()
    expect(screen.getByText(/로그인은 1단계에서 연결됩니다/)).toBeInTheDocument()
  })

  it('알 수 없는 경로는 404 페이지를 보여준다', () => {
    renderAt('/no-such-page')

    expect(screen.getByRole('heading', { level: 1, name: '페이지를 찾을 수 없음' })).toBeInTheDocument()
  })
})
