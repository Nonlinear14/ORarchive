import type { User } from '@supabase/supabase-js'
import type { Profile } from './context'

export const NICKNAME_MAX = 30
const NEXT_KEY = 'folio.auth.next'

/** 닉네임 검증. 문제가 있으면 한국어 메시지, 없으면 null. (SQL CHECK 와 같은 규칙) */
export function validateNickname(raw: string): string | null {
  const value = raw.trim()
  if (value.length === 0) return '닉네임을 입력해 주세요.'
  if ([...value].length > NICKNAME_MAX) return `닉네임은 ${NICKNAME_MAX}자 이하로 입력해 주세요.`
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return '닉네임에 사용할 수 없는 문자가 있어요.'
  return null
}

function metaString(user: User | null, key: string): string | null {
  const value: unknown = user?.user_metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** 화면에 보일 이름: 프로필 닉네임 → Google 이름 → 이메일 앞부분 → '기록자' */
export function displayName(user: User | null, profile: Profile | null): string {
  return (
    profile?.nickname ??
    metaString(user, 'full_name') ??
    metaString(user, 'name') ??
    user?.email?.split('@')[0] ??
    '기록자'
  )
}

export function avatarUrl(user: User | null, profile: Profile | null): string | null {
  return profile?.avatar_url ?? metaString(user, 'avatar_url') ?? metaString(user, 'picture')
}

/**
 * 로그인 후 돌아갈 앱 내부 경로만 허용한다 (오픈 리디렉션 방지).
 * '/foo?x=1' 같은 경로만 통과, '//evil.com', 'https://…', '/login' 은 거부.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/login/')) return null
  return next
}

export function rememberNextPath(next: string | null | undefined) {
  const safe = safeNextPath(next)
  try {
    if (safe && safe !== '/') sessionStorage.setItem(NEXT_KEY, safe)
    else sessionStorage.removeItem(NEXT_KEY)
  } catch {
    // 저장소 접근 불가 — 로그인 후 대시보드로 간다.
  }
}

/** 저장해 둔 경로를 꺼내고 지운다 */
export function takeNextPath(): string | null {
  try {
    const value = sessionStorage.getItem(NEXT_KEY)
    sessionStorage.removeItem(NEXT_KEY)
    return safeNextPath(value)
  } catch {
    return null
  }
}

const CALLBACK_PARAMS = ['code', 'error', 'error_code', 'error_description']

/** OAuth 리디렉션 URL(쿼리·해시)에 담긴 오류 설명을 읽는다 */
export function readCallbackError(location: Pick<Location, 'search' | 'hash'>): string | null {
  for (const source of [location.search, location.hash.replace(/^#/, '?')]) {
    const params = new URLSearchParams(source)
    const description = params.get('error_description') ?? params.get('error')
    if (description) return description.replace(/\+/g, ' ')
  }
  return null
}

/** OAuth 관련 쿼리를 지운 search 문자열. 지울 것이 없으면 null */
export function stripCallbackParams(search: string): string | null {
  const params = new URLSearchParams(search)
  if (!CALLBACK_PARAMS.some((key) => params.has(key))) return null
  CALLBACK_PARAMS.forEach((key) => params.delete(key))
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}
