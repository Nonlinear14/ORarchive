import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { Icon } from '../components/Icon'
import { useAuth } from '../lib/auth/context'
import { safeNextPath } from '../lib/auth/helpers'
import './LoginPage.css'

export function LoginPage() {
  const { configured, loading, user, callbackError, signInWithGoogle } = useAuth()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user) return <Navigate to={next ?? '/'} replace />

  async function handleGoogle() {
    setRedirecting(true)
    setError(null)
    try {
      await signInWithGoogle(next ?? undefined)
      // 성공하면 브라우저가 Google 로 이동한다. 버튼은 계속 '이동 중' 상태로 둔다.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRedirecting(false)
    }
  }

  const shownError = error ?? callbackError
  const disabled = !configured || loading || redirecting

  return (
    <section className="login-wrap">
      <title>로그인 · ORarchive</title>
      <div className="login-card">
        <div className="eyebrow">WELCOME TO ORARCHIVE</div>
        <h1>이야기를 이어갈 시간</h1>
        <p>Google 계정 하나로 모든 작품을 보관하고, PC와 모바일에서 같은 작업을 이어갈 수 있어요.</p>
        <button type="button" className="social-button google" disabled={disabled} onClick={handleGoogle}>
          <i aria-hidden="true">G</i>
          {redirecting ? 'Google로 이동하는 중…' : loading && configured ? '로그인 상태 확인 중…' : 'Google로 계속하기'}
        </button>
        {shownError && (
          <div className="callout danger login-alert" role="alert">
            <Icon name="alert" />
            <span>
              로그인하지 못했어요. 잠시 후 다시 시도해 주세요.
              <br />
              <span className="login-alert-detail">{shownError}</span>
            </span>
          </div>
        )}
        {!configured && (
          <div className="callout danger login-alert" role="alert">
            <Icon name="alert" />
            <span>서버 연결 설정이 없어 로그인할 수 없어요. 관리자에게 환경 변수 설정을 확인해 달라고 알려 주세요.</span>
          </div>
        )}
        <div className="auth-note">
          처음 로그인하면 계정과 프로필이 자동으로 만들어집니다.
          <br />
          <span className="muted">작성한 문서는 내 계정에만 비공개로 저장돼요.</span>
        </div>
      </div>
    </section>
  )
}
