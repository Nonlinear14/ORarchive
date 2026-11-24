import './LoadingState.css'

export function LoadingState({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-dot" aria-hidden="true" />
      {label}
    </div>
  )
}
