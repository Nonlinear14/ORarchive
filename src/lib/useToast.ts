import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastTone = 'good' | 'error'

export interface ToastState {
  id: number
  message: string
  tone: ToastTone
}

const TOAST_MS = 3200

/** 잠깐 보였다 사라지는 알림 하나 (새 알림이 오면 이전 것을 바꾼다) */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const show = useCallback((message: string, tone: ToastTone = 'good') => {
    clearTimeout(timer.current)
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, message, tone }))
    timer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  return { toast, show }
}
