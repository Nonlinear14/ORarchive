import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'
import type { Tables } from '../database.types'
import type { FolioClient } from '../supabase'

export type Profile = Tables<'profiles'>

export interface AuthContextValue {
  /** Supabase 환경 변수가 설정되어 있는지 */
  configured: boolean
  client: FolioClient | null
  /** 초기 세션 확인(PKCE 코드 교환 포함) 중 */
  loading: boolean
  session: Session | null
  user: User | null
  /** profiles 행. 불러오기 전이거나 실패하면 null (표시 이름은 displayName 으로 대체) */
  profile: Profile | null
  /** OAuth 리디렉션 URL 에 담겨 온 오류 */
  callbackError: string | null
  clearCallbackError(): void
  signInWithGoogle(next?: string): Promise<void>
  signOut(): Promise<void>
  updateNickname(nickname: string): Promise<void>
  deleteAccount(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth 는 <AuthProvider> 안에서만 사용할 수 있습니다.')
  return value
}
