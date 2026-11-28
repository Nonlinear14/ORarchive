import { Icon } from '../Icon'

/**
 * 수동 저장 편집기(핸드아웃 · 롤꾸코드, 2026-11-28)의 공통 부품.
 * - SaveActions: 편집 패널 맨 위 저장 · 사본으로 저장
 * - useManualSave: Ctrl(Cmd)+S, 저장하지 않고 나가려 할 때 묻기(앱 안 이동), 브라우저 닫기 · 새로고침 경고
 * - RestoredNotice: 지난번에 저장하지 않은 변경이 이 기기에 남아 있어 이어서 보여 줄 때
 * 저장하지 않은 입력은 동기화 계층이 곧바로 이 기기(IndexedDB)에 기록해 둔다 — 여기서는 저장 시점만 정한다.
 */

/** 저장 · 사본으로 저장 (수동 저장). save 는 성공하면 true, saveCopy 는 사본을 만들었으면 true */
export interface SavingProps {
  isNew: boolean
  dirty: boolean
  save(): Promise<boolean>
  saveCopy(): Promise<boolean>
}

export interface SaveActionsProps {
  /** 아직 서버에 없는 새 문서 (사본으로 저장은 꺼 둔다) */
  isNew: boolean
  dirty: boolean
  saving: boolean
  onSave(): void
  onSaveCopy(): void
}

export function SaveActions({ isNew, dirty, saving, onSave, onSaveCopy }: SaveActionsProps) {
  return (
    <div className="panel-section save-actions" role="group" aria-label="저장">
      <button type="button" className="btn primary small" disabled={saving || (!dirty && !isNew)} onClick={onSave} title="저장 (Ctrl+S)">
        <Icon name="cloud" /> {saving ? '저장 중…' : '저장'}
      </button>
      <button
        type="button"
        className="btn small"
        disabled={saving || isNew}
        onClick={onSaveCopy}
        title={isNew ? '먼저 저장한 뒤에 사본을 만들 수 있어요' : '지금 고친 내용으로 사본을 만들어요 (원본은 마지막으로 저장한 그대로)'}
      >
        <Icon name="copy" /> 사본으로 저장
      </button>
    </div>
  )
}

/** 지난번에 저장하지 않은 변경이 이 기기에 남아 있어 이어서 보여 주는 중 */
export function RestoredNotice({ onSave, onDiscard }: { onSave(): void; onDiscard(): void }) {
  return (
    <div className="callout restored-notice" role="status">
      <Icon name="alert" />
      <span>저장하지 않은 변경이 남아 있어요. 마지막으로 편집하던 내용을 이어서 보여 주고 있어요.</span>
      <span className="restored-actions">
        <button type="button" className="btn small primary" onClick={onSave}>
          저장
        </button>
        <button type="button" className="btn small" onClick={onDiscard}>
          변경 버리기
        </button>
      </span>
    </div>
  )
}

