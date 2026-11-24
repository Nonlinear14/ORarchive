import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSupabaseEnv } from './supabase'

const env = (vars: Partial<ImportMetaEnv>) => vars as ImportMetaEnv

describe('readSupabaseEnv', () => {
  it('두 VITE_ 변수를 읽는다', () => {
    expect(
      readSupabaseEnv(
        env({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }),
      ),
    ).toEqual({ url: 'https://example.supabase.co', publishableKey: 'sb_publishable_x' })
  })

  it('하나라도 비어 있으면 null', () => {
    expect(readSupabaseEnv(env({ VITE_SUPABASE_URL: 'https://example.supabase.co' }))).toBeNull()
    expect(readSupabaseEnv(env({ VITE_SUPABASE_URL: ' ', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' }))).toBeNull()
  })
})

describe('supabase 클라이언트 모듈', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('환경 변수가 있으면 클라이언트를 만든다', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    const mod = await import('./supabase')

    expect(mod.isSupabaseConfigured).toBe(true)
    expect(mod.supabase).not.toBeNull()
    expect(typeof mod.supabase?.auth.signInWithOAuth).toBe('function')
  })

  it('환경 변수가 없으면 null 로 두고 앱을 깨뜨리지 않는다', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    const mod = await import('./supabase')

    expect(mod.isSupabaseConfigured).toBe(false)
    expect(mod.supabase).toBeNull()
  })
})
