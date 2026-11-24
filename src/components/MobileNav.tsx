import { NavLink } from 'react-router'
import { mobileNav } from '../routes'
import { Icon } from './Icon'
import './MobileNav.css'

export function MobileNav() {
  return (
    <nav className="mobile-nav" aria-label="모바일 메뉴">
      {mobileNav.map((item) => (
        <NavLink key={item.path} to={item.path} end={item.path === '/'}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
