import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createFakeSupabase } from '../test/fakeSupabase'
import { renderApp } from '../test/renderApp'

afterEach(() => {
  sessionStorage.clear()
})

describe('로그인 페이지', () => {
  it('비로그인: Google 버튼이 켜져 있고 카카오는 없다', async () => {
    const { client } = createFakeSupabase({ user: null })
    renderApp('/login', { client })

    const button = await screen.findByRole('button', { name: /Google로 계속하기/ })
    expect(button).toBeEnabled()
    expect(screen.queryByText(/kakao|카카오/i)).not.toBeInTheDocument()
  })

  it('세션 확인 중에는 버튼이 꺼져 있다', () => {
    const { client } = createFakeSupabase({ user: null, sessionDelayMs: 50 })
    renderApp('/login', { client })

    expect(screen.getByRole('button', { name: /로그인 상태 확인 중/ })).toBeDisabled()
  })

  it('클릭하면 PKCE OAuth 를 base URL 로 돌아오게 시작하고, next 경로를 기억한다', async () => {
    const { client, control } = createFakeSupabase({ user: null })
    renderApp('/login?next=%2Flibrary', { client })

    fireEvent.click(await screen.findByRole('button', { name: /Google로 계속하기/ }))

    expect(await screen.findByRole('button', { name: /Google로 이동하는 중/ })).toBeDisabled()
    expect(control.signInWithOAuth.calls).toEqual([
      {
        provider: 'google',
        options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
      },
    ])
    expect(sessionStorage.getItem('folio.auth.next')).toBe('/library')
  })

  it('OAuth 시작이 실패하면 오류를 보여주고 다시 누를 수 있다', async () => {
    const { client, control } = createFakeSupabase({ user: null })
    control.signInWithOAuth.error = { message: 'provider is not enabled' }
    renderApp('/login', { client })

    fireEvent.click(await screen.findByRole('button', { name: /Google로 계속하기/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('provider is not enabled')
    expect(screen.getByRole('button', { name: /Google로 계속하기/ })).toBeEnabled()
  })

  it('외부 주소 next 는 무시한다 (오픈 리디렉션 방지)', async () => {
    const { client } = createFakeSupabase({ user: null })
    renderApp('/login?next=%2F%2Fevil.example', { client })

    fireEvent.click(await screen.findByRole('button', { name: /Google로 계속하기/ }))

    await screen.findByRole('button', { name: /Google로 이동하는 중/ })
    expect(sessionStorage.getItem('folio.auth.next')).toBeNull()
  })

  it('이미 로그인했으면 next 경로(없으면 대시보드)로 보낸다', async () => {
    const { client } = createFakeSupabase()
    renderApp('/login?next=%2Flibrary', { client })

    expect(await screen.findByRole('heading', { level: 1, name: '내 보관함' })).toBeInTheDocument()
  })

  it('OAuth 리디렉션 후 기억해 둔 경로로 이동하고 콜백 파라미터를 지운다', async () => {
    sessionStorage.setItem('folio.auth.next', '/settings')
    const { client } = createFakeSupabase()
    renderApp('/?code=abc', { client })

    expect(await screen.findByRole('heading', { level: 1, name: '계정 설정' })).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe('/settings')
  })

  it('Supabase 설정이 없으면 버튼을 끄고 설정 오류를 보여준다', () => {
    renderApp('/login', { client: null })

    expect(screen.getByRole('button', { name: /Google로 계속하기/ })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('서버 연결 설정이 없어')
  })
})
