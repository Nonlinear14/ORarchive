import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from './context'
import { stripCallbackParams, takeNextPath } from './helpers'

/**
 * OAuth 리디렉션 후처리 (라우터 안에서 렌더).
 * 1) ?code= / ?error= 를 주소창에서 지운다 — auth-js 가 history 를 직접 바꿔도 라우터는 모르므로 여기서 동기화
 * 2) 로그인 전에 기억해 둔 ?next= 경로로 이동한다
 */
export function AuthRedirects() {
  const { loading, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    const cleaned = stripCallbackParams(location.search)
    const next = user ? takeNextPath() : null
    if (next) {
      navigate(next, { replace: true })
    } else if (cleaned !== null) {
      navigate({ pathname: location.pathname, search: cleaned, hash: location.hash }, { replace: true })
    }
  }, [loading, user, location.pathname, location.search, location.hash, navigate])

  return null
}
