import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 평소에는 무채색이고 눌렀을 때만 포인트색으로 강조하는 버튼(.press-accent, 2026-11-28)의 휴대폰 동작.
 * 마우스가 없는 기기(hover: none)에서는 누른 순간이 너무 짧아 색이 거의 안 보이므로,
 * 누르면 잠깐(PRESS_MS) 포인트색을 보여 준 뒤에 할 일을 한다. 마우스가 있는 기기는 곧바로 한다.
 */
export const PRESS_MS = 160

/** 마우스 없이 손가락으로만 누르는 기기 */
export function isTouchOnly(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches
}

export function usePressAccent() {
  const [pressed, setPressed] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  /** key 버튼을 잠깐 강조한 뒤 action 을 한다 (휴대폰에서 이동하는 버튼) */
  const press = useCallback((key: string, action: () => void) => {
    window.clearTimeout(timer.current)
    setPressed(key)
    timer.current = window.setTimeout(() => {
      setPressed(null)
      action()
    }, PRESS_MS)
  }, [])

  /** 저장처럼 기다릴 필요가 없는 버튼: 할 일은 곧바로 하고, 휴대폰에서는 색만 잠깐 보여 준다 */
  const flash = useCallback((key: string) => {
    if (!isTouchOnly()) return
    window.clearTimeout(timer.current)
    setPressed(key)
    timer.current = window.setTimeout(() => setPressed(null), PRESS_MS)
  }, [])

  return { pressed, press, flash }
}
