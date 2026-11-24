import { isSupabaseConfigured } from '../lib/supabase'
import './LoginPage.css'

export function LoginPage() {
  return (
    <section className="login-wrap">
      <title>로그인 · FOLIO</title>
      <div className="login-card">
        <div className="eyebrow">WELCOME TO FOLIO</div>
        <h1>이야기를 이어갈 시간</h1>
        <p>Google 계정 하나로 모든 작품을 보관하고, PC와 모바일에서 같은 작업을 이어갈 수 있어요.</p>
        <button type="button" className="social-button google" disabled>
          <i aria-hidden="true">G</i> Google로 계속하기
        </button>
        <div className="auth-note">
          로그인은 1단계에서 연결됩니다.
          <br />
          <span className="muted">
            서버 연결 설정: {isSupabaseConfigured ? '확인됨' : '누락 (환경 변수를 확인하세요)'}
          </span>
        </div>
      </div>
    </section>
  )
}
