import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../lib/auth/context'
import { avatarUrl, displayName } from '../lib/auth/helpers'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import './ProfileMenu.css'

/** 상단바 오른쪽 프로필 버튼. 비로그인이면 로그인 링크. */
export function ProfileMenu() {
  const { user, profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) {
    return (
      <Link to="/login" className="mini-avatar" aria-label="로그인" title="로그인">
        F
      </Link>
    )
  }

  const name = displayName(user, profile)

  async function handleSignOut() {
    setOpen(false)
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        type="button"
        className="mini-avatar"
        aria-label={`${name} 계정 메뉴`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={name} url={avatarUrl(user, profile)} className="mini-avatar-inner" />
      </button>
      {open && (
        <div className="profile-pop" id={menuId}>
          <div className="profile-pop-head">
            <strong>{name}</strong>
            <small>{user.email}</small>
          </div>
          <Link to="/settings" className="profile-pop-item" onClick={() => setOpen(false)}>
            <Icon name="settings" /> 계정 설정
          </Link>
          <button type="button" className="profile-pop-item" onClick={handleSignOut}>
            <Icon name="logout" /> 로그아웃
          </button>
        </div>
      )}
    </div>
  )
}
