import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../lib/auth/context'
import { stripCallbackParams } from '../lib/auth/helpers'
import { ConfigMissing } from './ConfigMissing'
import { LoadingState } from './LoadingState'

/** 로그인이 필요한 라우트 묶음. 비로그인 사용자는 /login?next=… 으로 보낸다. */
export function RequireAuth() {
  const { configured, loading, user } = useAuth()
  const location = useLocation()

  if (!configured) return <ConfigMissing />
  if (loading) return <LoadingState label="로그인 상태를 확인하는 중…" />
  if (!user) {
    // OAuth 콜백 잔여 파라미터(?error= 등)는 next 에 싣지 않는다.
    const next = location.pathname + (stripCallbackParams(location.search) ?? location.search)
    const to = next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`
    return <Navigate to={to} replace />
  }
  return <Outlet />
}
