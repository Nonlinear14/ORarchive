import type { Session, User } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, type FolioClient } from '../supabase'
import { AuthContext, type AuthContextValue, type Profile } from './context'
import { displayName, avatarUrl, readCallbackError, rememberNextPath, validateNickname } from './helpers'

interface AuthProviderProps {
  /** 테스트에서 가짜 클라이언트를 주입할 때만 지정. 기본값은 앱 전역 클라이언트(없으면 null) */
  client?: FolioClient | null
  children: ReactNode
}

interface ProfileState {
  userId: string
  profile: Profile | null
}

function initialCallbackError(): string | null {
  return typeof window === 'undefined' ? null : readCallbackError(window.location)
}

/** profiles 행을 읽고, 없으면(마이그레이션 전에 가입한 계정 등) Google 정보로 만든다 */
async function loadOrCreateProfile(client: FolioClient, user: User): Promise<Profile | null> {
  const { data, error } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (data) return data

  const nickname = displayName(user, null).slice(0, 30).trim() || '기록자'
  const { data: created, error: insertError } = await client
    .from('profiles')
    .insert({ id: user.id, nickname, avatar_url: avatarUrl(user, null) })
    .select('*')
    .single()
  if (insertError) throw insertError
  return created
}

export function AuthProvider({ client = supabase, children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(client !== null)
  const [profileState, setProfileState] = useState<ProfileState | null>(null)
  const [callbackError, setCallbackError] = useState(initialCallbackError)

  // 세션 구독. detectSessionInUrl 덕분에 getSession() 은 ?code= 교환이 끝난 뒤 돌아온다.
  useEffect(() => {
    if (!client) return
    let active = true

    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return
        setSession(data.session)
        if (error) setCallbackError(error.message)
      })
      .catch((error: unknown) => {
        if (active) setCallbackError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const { data } = client.auth.onAuthStateChange((_event, next) => {
      // 콜백 안에서 다른 supabase 호출을 await 하지 않는다 (auth-js 잠금 교착 방지).
      if (active) setSession(next)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [client])

  const user = session?.user ?? null
  const userId = user?.id ?? null

  // 프로필 불러오기 (사용자가 바뀔 때마다)
  useEffect(() => {
    if (!client || !user) return
    let active = true
    loadOrCreateProfile(client, user)
      .then((profile) => {
        if (active) setProfileState({ userId: user.id, profile })
      })
      .catch(() => {
        // 프로필 테이블이 아직 없거나 네트워크 오류 — Google 메타데이터로 표시를 대신한다.
        if (active) setProfileState({ userId: user.id, profile: null })
      })
    return () => {
      active = false
    }
    // user 객체는 토큰 갱신마다 바뀌므로 id 로만 반응한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, userId])

  const profile = profileState && profileState.userId === userId ? profileState.profile : null

  const signInWithGoogle = useCallback(
    async (next?: string) => {
      if (!client) throw new Error('서버 연결 설정이 없어 로그인할 수 없습니다.')
      setCallbackError(null)
      rememberNextPath(next)
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
      })
      if (error) throw new Error(error.message)
    },
    [client],
  )

  const signOut = useCallback(async () => {
    if (!client) return
    const { error } = await client.auth.signOut()
    // 서버 호출이 실패해도(오프라인 등) 이 기기에서는 반드시 로그아웃한다.
    if (error) await client.auth.signOut({ scope: 'local' })
    setSession(null)
  }, [client])

  const updateNickname = useCallback(
    async (raw: string) => {
      if (!client || !userId) throw new Error('로그인이 필요합니다.')
      const problem = validateNickname(raw)
      if (problem) throw new Error(problem)
      const { data, error } = await client
        .from('profiles')
        .update({ nickname: raw.trim() })
        .eq('id', userId)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      setProfileState({ userId, profile: data })
    },
    [client, userId],
  )

  const deleteAccount = useCallback(async () => {
    if (!client) throw new Error('서버 연결 설정이 없습니다.')
    const { error } = await client.rpc('delete_my_account')
    if (error) throw new Error(error.message)
    // 사용자가 이미 지워졌으므로 서버 로그아웃 대신 이 기기의 세션만 정리한다.
    await client.auth.signOut({ scope: 'local' })
    setSession(null)
  }, [client])

  const clearCallbackError = useCallback(() => setCallbackError(null), [])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: client !== null,
      client,
      loading,
      session,
      user,
      profile,
      callbackError,
      clearCallbackError,
      signInWithGoogle,
      signOut,
      updateNickname,
      deleteAccount,
    }),
    [
      client,
      loading,
      session,
      user,
      profile,
      callbackError,
      clearCallbackError,
      signInWithGoogle,
      signOut,
      updateNickname,
      deleteAccount,
    ],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
