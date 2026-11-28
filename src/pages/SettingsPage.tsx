import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Avatar } from '../components/Avatar'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { PageHeading } from '../components/PageHeading'
import { useAuth } from '../lib/auth/context'
import { setTheme, useTheme } from '../lib/theme'
import { NICKNAME_MAX, avatarUrl, displayName, validateNickname } from '../lib/auth/helpers'
import './SettingsPage.css'

function ProfileCard() {
  const { user, profile, updateNickname } = useAuth()
  const name = displayName(user, profile)
  const [value, setValue] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'good' | 'error'; text: string } | null>(null)
  const nickname = value ?? name

  async function submit(event: FormEvent) {
    event.preventDefault()
    const problem = validateNickname(nickname)
    if (problem) {
      setMessage({ tone: 'error', text: problem })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      await updateNickname(nickname)
      setValue(null)
      setMessage({ tone: 'good', text: '닉네임을 저장했어요.' })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-card">
      <h3>내 프로필</h3>
      <div className="profile-row">
        <Avatar name={name} url={avatarUrl(user, profile)} className="avatar large" />
        <div>
          <b>{name}</b>
          <p>다른 사람에게 보이는 이름이에요.</p>
        </div>
      </div>
      <form onSubmit={submit} noValidate>
        <label className="field-label" htmlFor="nickname">
          닉네임
        </label>
        <div className="inline-form">
          <input
            id="nickname"
            className="field-input"
            value={nickname}
            maxLength={NICKNAME_MAX + 10}
            aria-invalid={message?.tone === 'error'}
            aria-describedby="nickname-help"
            onChange={(event) => {
              setValue(event.target.value)
              setMessage(null)
            }}
          />
          <button type="submit" className="btn primary" disabled={busy || value === null}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
        <p id="nickname-help" className={message?.tone === 'error' ? 'field-error' : 'field-help'} role={message ? 'status' : undefined}>
          {message?.text ?? `1~${NICKNAME_MAX}자, 앞뒤 공백은 지워져요.`}
        </p>
      </form>
    </section>
  )
}

function AccountCard() {
  const { user } = useAuth()
  return (
    <section className="settings-card">
      <h3>연결된 계정</h3>
      <div className="connected">
        <span>
          <b>Google</b>
          <small>{user?.email ?? '이메일 정보 없음'}</small>
        </span>
        <span className="tag good">연결됨</span>
      </div>
      <p>ORarchive는 Google 로그인만 지원합니다. 같은 Google 계정으로 로그인하면 어느 기기에서든 같은 문서를 불러와요.</p>
    </section>
  )
}

/** 모바일에서는 사이드바가 없어서 여기서도 테마를 바꿀 수 있게 한다 */
function ThemeCard() {
  const theme = useTheme()
  return (
    <section className="settings-card">
      <h3>화면 모드</h3>
      <p>이 기기에서만 적용돼요.</p>
      <div className="segmented" role="radiogroup" aria-label="화면 모드">
        {(
          [
            ['light', '라이트모드'],
            ['dark', '다크모드'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            className={theme === value ? 'active' : ''}
            onClick={() => setTheme(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}

function SyncCard() {
  return (
    <section className="settings-card">
      <h3>기기 간 동기화</h3>
      <p>로그는 입력을 멈추면 잠시 뒤 서버에 자동 저장돼요. 핸드아웃과 롤꾸코드는 저장을 누를 때 서버에 저장돼요.</p>
      <div className="connected">
        <span>로그 서버 자동 저장</span>
        <span className="tag good">사용 중</span>
      </div>
      <div className="connected">
        <span>오프라인 임시 보관 (이 기기)</span>
        <span className="tag good">사용 중</span>
      </div>
      <div className="connected">
        <span>다른 기기와 동시 수정 시 충돌 확인</span>
        <span className="tag good">사용 중</span>
      </div>
    </section>
  )
}

function DangerCard() {
  const { signOut, deleteAccount } = useAuth()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <section className="settings-card">
      <h3>계정 관리</h3>
      <div className="connected">
        <span>이 기기에서 로그아웃</span>
        <button type="button" className="btn small" onClick={handleSignOut} disabled={signingOut}>
          <Icon name="logout" /> {signingOut ? '로그아웃 중…' : '로그아웃'}
        </button>
      </div>
      <div className="connected">
        <span>
          계정 삭제
          <small>프로필과 모든 문서가 영구히 삭제되며 되돌릴 수 없어요.</small>
        </span>
        <button type="button" className="btn small danger" onClick={() => setConfirming(true)}>
          계정 삭제
        </button>
      </div>
      {confirming && (
        <ConfirmDialog
          title="계정을 삭제할까요?"
          message="프로필, 프로젝트, 모든 문서가 서버에서 즉시 영구 삭제됩니다. 삭제한 뒤에는 복구할 수 없어요."
          confirmLabel="영구 삭제"
          requireText="계정 삭제"
          danger
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await deleteAccount()
            navigate('/login', { replace: true })
          }}
        />
      )}
    </section>
  )
}

export function SettingsPage() {
  return (
    <>
      <PageHeading
        title="계정 설정"
        eyebrow="SETTING / ACCOUNT"
        description="프로필, 로그인 연결, 기기 간 동기화 상태를 확인하세요."
      />
      <div className="settings-grid">
        <ProfileCard />
        <AccountCard />
        <ThemeCard />
        <SyncCard />
        <DangerCard />
      </div>
    </>
  )
}
