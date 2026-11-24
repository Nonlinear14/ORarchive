import { describe, expect, it } from 'vitest'
import { makeUser } from '../../test/fakeSupabase'
import { displayName, readCallbackError, safeNextPath, stripCallbackParams, validateNickname } from './helpers'

describe('validateNickname', () => {
  it.each([
    ['', '닉네임을 입력해 주세요.'],
    ['   ', '닉네임을 입력해 주세요.'],
    ['가'.repeat(31), '닉네임은 30자 이하로 입력해 주세요.'],
    ['tab\there', '닉네임에 사용할 수 없는 문자가 있어요.'],
  ])('%j → 오류', (value, message) => {
    expect(validateNickname(value)).toBe(message)
  })

  it('앞뒤 공백을 뺀 1~30자는 통과', () => {
    expect(validateNickname('  달빛 기록자 ')).toBeNull()
    expect(validateNickname('가'.repeat(30))).toBeNull()
  })
})

describe('safeNextPath', () => {
  it.each([
    ['/library', '/library'],
    ['/documents/1?x=1', '/documents/1?x=1'],
    ['//evil.example', null],
    ['https://evil.example', null],
    ['/\\evil', null],
    ['/login', null],
    ['/login?next=/x', null],
    [null, null],
  ])('%j → %j', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected)
  })
})

describe('OAuth 콜백 URL', () => {
  it('쿼리나 해시의 error_description 을 읽는다', () => {
    expect(readCallbackError({ search: '?error=access_denied&error_description=User+denied', hash: '' })).toBe(
      'User denied',
    )
    expect(readCallbackError({ search: '', hash: '#error=server_error' })).toBe('server_error')
    expect(readCallbackError({ search: '?code=1', hash: '' })).toBeNull()
  })

  it('콜백 파라미터만 지우고 나머지는 남긴다', () => {
    expect(stripCallbackParams('?code=abc')).toBe('')
    expect(stripCallbackParams('?error=x&error_description=y&tab=2')).toBe('?tab=2')
    expect(stripCallbackParams('?tab=2')).toBeNull()
  })
})

describe('displayName', () => {
  it('프로필 닉네임 → Google 이름 → 이메일 앞부분 순서', () => {
    const user = makeUser()
    expect(
      displayName(user, { id: 'user-1', nickname: '닉', avatar_url: null, created_at: '', updated_at: '' }),
    ).toBe('닉')
    expect(displayName(user, null)).toBe('달빛 기록자')
    expect(displayName(makeUser({ user_metadata: {} }), null)).toBe('reader')
    expect(displayName(null, null)).toBe('기록자')
  })
})
