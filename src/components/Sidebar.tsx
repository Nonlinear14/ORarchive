import { useEffect } from 'react'
import { closeMobileSidebar, useSidebarCollapsed } from '../lib/sidebar'
import { NavLink, useLocation } from 'react-router'
import { toggleTheme, useTheme } from '../lib/theme'
import { navSections, type NavSection } from '../routes'
import { Icon } from './Icon'
import './Sidebar.css'

function ThemeToggle() {
  const theme = useTheme()
  const dark = theme === 'dark'
  return (
    <button type="button" role="switch" aria-checked={dark} className="nav-sub theme-toggle" onClick={toggleTheme} title="화면 전환 (라이트모드/다크모드)">
      <span>화면 전환</span>
      <span className="switch" aria-hidden="true">
        <span className="switch-knob" />
      </span>
      <span className="sr-only">{dark ? '지금은 다크모드' : '지금은 라이트모드'}</span>
    </button>
  )
}

function SubLinks({ section }: { section: NavSection }) {
  return (
    <>
      {section.children?.map((route) => (
        <NavLink key={route.path} to={route.path} end className="nav-sub" title={route.label}>
          <span>{route.label}</span>
        </NavLink>
      ))}
      {section.themeToggle && <ThemeToggle />}
    </>
  )
}

function SectionNav({ section }: { section: NavSection }) {
  // 하위 메뉴가 없으면 제목 자체가 링크
  if (section.route)
    return (
      <div className="nav-section">
        <NavLink to={section.route.path} className="nav-title nav-title-link" title={section.label}>
          <Icon name={section.icon} />
          <span className="nav-title-text">{section.label}</span>
        </NavLink>
      </div>
    )

  const headingId = `nav-${section.label.replace(/\s+/g, '-')}`
  return (
    <div className="nav-section" role="group" aria-labelledby={headingId}>
      <div className="nav-title" id={headingId}>
        <Icon name={section.icon} />
        <span className="nav-title-text">{section.label}</span>
      </div>
      <div className="nav-subs">
        <SubLinks section={section} />
      </div>
    </div>
  )
}

/** 휴대폰 서랍: 화면을 옮기거나 Esc 를 누르면 닫는다 */
function useCloseDrawerOnNavigate() {
  const { pathname } = useLocation()
  useEffect(() => closeMobileSidebar(), [pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMobileSidebar()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}

export function Sidebar() {
  const collapsed = useSidebarCollapsed()
  useCloseDrawerOnNavigate()
  return (
    <>
      {/* 서랍 뒤 어두운 배경 (좁은 화면만 보임). 접힌 동안에도 남겨 두어 서서히 사라지게 한다 */}
      <button
        type="button"
        className={collapsed ? 'side-backdrop' : 'side-backdrop is-open'}
        aria-label="메뉴 닫기"
        aria-hidden={collapsed || undefined}
        tabIndex={-1}
        onClick={closeMobileSidebar}
      />
      {/* 접혀도 그려 둔 채 움직임으로 숨긴다 (inert · aria-hidden 으로 키보드 · 화면 낭독기에서는 바로 빠진다) */}
      <aside className={collapsed ? 'sidebar is-collapsed' : 'sidebar'} id="main-sidebar" inert={collapsed} aria-hidden={collapsed || undefined}>
        <nav className="side-content" aria-label="주 메뉴">
          {navSections.map((section) => (
            <SectionNav key={section.label} section={section} />
          ))}
        </nav>
        <div className="side-footer">
          <div className="quota">
            <div className="quota-title">
              <span>내 클라우드 공간</span>
              <small>준비 중</small>
            </div>
            <div className="progress" aria-hidden="true">
              <div />
            </div>
            <div className="quota-foot">사용량 표시는 준비 중입니다</div>
          </div>
        </div>
      </aside>
    </>
  )
}
