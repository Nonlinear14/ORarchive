import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SaveActions } from '../components/document/ManualSave'

function mockHover(none: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query === '(hover: none)' ? none : false, media: query, addEventListener() {}, removeEventListener() {} })),
  )
}

describe('눌렀을 때만 강조하는 저장 버튼', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('휴대폰에서는 누른 순간 잠깐 강조하고, 저장은 곧바로 한다', async () => {
    mockHover(true)
    vi.useFakeTimers()
    const onSave = vi.fn()
    render(<SaveActions isNew={false} dirty saving={false} onSave={onSave} onSaveCopy={() => {}} />)
    const button = screen.getByRole('button', { name: /^저장/ })
    expect(button).not.toHaveClass('primary')
    fireEvent.click(button)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(button).toHaveClass('is-pressed')
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    expect(button).not.toHaveClass('is-pressed')
  })

  it('마우스가 있는 기기에서는 따로 강조 상태를 남기지 않는다', () => {
    mockHover(false)
    const onSave = vi.fn()
    render(<SaveActions isNew={false} dirty saving={false} onSave={onSave} onSaveCopy={() => {}} />)
    const button = screen.getByRole('button', { name: /^저장/ })
    fireEvent.click(button)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(button).not.toHaveClass('is-pressed')
  })
})
