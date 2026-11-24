import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SupabaseEnv {
  url: string
  publishableKey: string
}

/** 빌드 시점에 주입된 VITE_ 환경 변수를 읽는다. 값이 없으면 null. */
export function readSupabaseEnv(env: ImportMetaEnv = import.meta.env): SupabaseEnv | null {
  const url = env.VITE_SUPABASE_URL?.trim()
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  return url && publishableKey ? { url, publishableKey } : null
}

const config = readSupabaseEnv()

export const isSupabaseConfigured = config !== null

/**
 * 앱 전역 Supabase 클라이언트 (PKCE 흐름).
 * 환경 변수가 없으면 null — 앱 셸은 계속 동작하고, 로그인 기능만 비활성화된다.
 */
export const supabase: SupabaseClient | null = config
  ? createClient(config.url, config.publishableKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null
