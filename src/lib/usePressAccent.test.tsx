import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePressAccent } from './usePressAccent'

function mockHover(none: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query === '(hover: none)' ? none : false, media: query, addEventListener() {}, removeEventListener() {} })),
  )
}

/** 홈 편집 바로가기처럼 누르면 잠깐 강조한 뒤 이동하는 버튼 */
function Tile({ onGo }: { onGo(): void }) {
  const { pressed, press } = usePressAccent()
  return (
    <button type="button" className={`press-accent${pressed === 't' ? ' is-pressed' : ''}`} onClick={() => press('t', onGo)}>
      바로가기
    </button>
  )
}

describe('눌렀을 때만 강조하는 버튼', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('누르면 잠깐 강조한 뒤에 이동한다', async () => {
    mockHover(true)
    vi.useFakeTimers()
    const onGo = vi.fn()
    render(<Tile onGo={onGo} />)
    const button = screen.getByRole('button', { name: '바로가기' })
    fireEvent.click(button)
    expect(button).toHaveClass('is-pressed')
    expect(onGo).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    expect(onGo).toHaveBeenCalledTimes(1)
    expect(button).not.toHaveClass('is-pressed')
  })
})
