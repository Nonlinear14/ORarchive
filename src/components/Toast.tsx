import type { ToastState } from '../lib/useToast'
import { Icon } from './Icon'
import './Toast.css'

/** 화면 아래 가운데의 짧은 알림 (목업의 #toast). 스크린 리더에는 status 로 읽힌다 */
export function Toast({ toast }: { toast: ToastState | null }) {
  return (
    <div
      className={toast ? `toast show ${toast.tone}` : 'toast'}
      role={toast?.tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      data-testid="toast"
    >
      {toast && (
        <>
          <Icon name={toast.tone === 'error' ? 'alert' : 'check'} /> {toast.message}
        </>
      )}
    </div>
  )
}
