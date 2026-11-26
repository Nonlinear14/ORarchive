import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { toggleTheme, useTheme } from '../lib/theme'
import { navSections, type NavSection } from '../routes'
import { SidebarBrand } from './Brand'
import { Icon } from './Icon'
import './Sidebar.css'

function ThemeToggle() {
  const theme = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      className="nav-sub theme-toggle"
      onClick={toggleTheme}
      title="화면 전환 (라이트모드/다크모드)"
    >
      <span>화면 전환</span>
      <span className="switch" aria-hidden="true">
        <span className="switch-knob" />
      </span>
      <span className="sr-only">{dark ? '지금은 다크모드' : '지금은 라이트모드'}</span>
    </button>
  )
}

/** 접힌 사이드바(≤1050px)에서는 하위 메뉴를 펼칠 공간이 없다 */
const COLLAPSED_QUERY = '(max-width: 1050px)'

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(COLLAPSED_QUERY).matches : false,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(COLLAPSED_QUERY)
    const onChange = () => setCollapsed(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return collapsed
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

/** 접힌 사이드바: 상위 메뉴 아이콘을 누르면 오른쪽에 하위 메뉴 말풍선을 띄운다 */
function SectionBubble({ section, active }: { section: NavSection; active: boolean }) {
  const [open, setOpen] = useState(false)
  const [top, setTop] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const bubbleId = `bubble-${section.label.replace(/\s+/g, '-')}`

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!bubbleRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={active ? 'nav-title nav-title-button active' : 'nav-title nav-title-button'}
        aria-expanded={open}
        aria-controls={open ? bubbleId : undefined}
        title={section.label}
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect()
          if (rect) setTop(rect.top)
          setOpen((value) => !value)
        }}
      >
        <Icon name={section.icon} />
        <span className="sr-only">{section.label}</span>
      </button>
      {open && (
        <div
          ref={bubbleRef}
          id={bubbleId}
          className="nav-bubble"
          role="group"
          aria-label={section.label}
          style={{ top }}
          // 하위 메뉴를 고르면 닫는다 (테마 토글은 열어 둔다)
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) setOpen(false)
          }}
        >
          <div className="nav-bubble-title">{section.label}</div>
          <SubLinks section={section} />
        </div>
      )}
    </>
  )
}

function SectionNav({ section, collapsed }: { section: NavSection; collapsed: boolean }) {
  const { pathname } = useLocation()
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

  if (collapsed) {
    const active = section.children?.some((route) => route.path === pathname) ?? false
    return (
      <div className="nav-section">
        <SectionBubble section={section} active={active} />
      </div>
    )
  }

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

export function Sidebar() {
  const collapsed = useCollapsed()
  return (
    <aside className="sidebar">
      <SidebarBrand />
      <nav className="side-content" aria-label="주 메뉴">
        {navSections.map((section) => (
          <SectionNav key={section.label} section={section} collapsed={collapsed} />
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
  )
}
