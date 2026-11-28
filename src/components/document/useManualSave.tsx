import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useLocation, useNavigate } from 'react-router'
import type { DocumentDraft } from '../../lib/documents'
import { Modal } from '../Modal'

interface ManualSaveOptions {
  /** 저장하지 않은 변경이 있음 (새 문서는 무엇이든 넣었으면) */
  dirty: boolean
  isNew: boolean
  /** 저장. 성공하면 true (실패는 호출한 쪽이 알린다) */
  save(): Promise<boolean>
  /** 나가기 창의 저장 (새 문서: 만들기만 하고 이 화면에서 넘어가지 않는다). 없으면 save */
  saveBeforeLeave?(): Promise<boolean>
  /** 새 문서: 아무것도 하지 않음. 저장된 문서: 저장하지 않은 변경 버리기 */
  discard(): void
}

/**
 * 저장하지 않은 변경이 있을 때 다른 화면으로 가려 하면 막고 "아직 저장하지 않았어요" 창을 띄운다.
 * allowNext() 를 부른 뒤의 이동 한 번은 묻지 않는다 (저장 후 새 문서 · 사본 편집기로 넘어갈 때).
 */
export function useManualSave({ dirty, isNew, save, saveBeforeLeave, discard }: ManualSaveOptions) {
  const allow = useRef(false)
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: { currentLocation: { pathname: string; search: string }; nextLocation: { pathname: string; search: string } }) => {
        if (allow.current) {
          allow.current = false
          return false
        }
        return dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search)
      },
      [dirty],
    ),
  )
  const latest = useRef({ save, dirty })
  useEffect(() => {
    latest.current = { save, dirty }
  })

  // Ctrl(Cmd)+S → 저장
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return
      e.preventDefault()
      void latest.current.save()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // 브라우저 닫기 · 새로고침: 브라우저 기본 경고 (입력은 이 기기에 남아 다시 열면 이어서 보인다)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const dialog =
    blocker.state === 'blocked' ? (
      <Modal
        title="아직 저장하지 않았어요. 이대로 나갈까요?"
        eyebrow="저장하지 않은 변경"
        onClose={() => {
          if (!busy) blocker.reset()
        }}
      >
        <p>
          {isNew
            ? '이 템플릿은 아직 한 번도 저장하지 않았어요. 삭제하면 목록에 남지 않아요.'
            : '마지막으로 저장한 뒤에 고친 내용이 있어요. 변경을 버리면 마지막으로 저장한 상태로 남아요.'}
        </p>
        {failed && (
          <p className="field-error" role="alert">
            저장하지 못했어요. 고친 내용은 그대로 있어요 — 연결을 확인한 뒤 다시 저장해 주세요.
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              setFailed(false)
              blocker.reset()
            }}
          >
            취소
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={busy}
            onClick={() => {
              setFailed(false)
              discard()
              blocker.proceed()
            }}
          >
            {isNew ? '삭제' : '변경 버리기'}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setFailed(false)
              const ok = await (saveBeforeLeave ?? save)().catch(() => false)
              setBusy(false)
              if (ok) blocker.proceed()
              else setFailed(true)
            }}
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </Modal>
    ) : null

  return {
    dialog,
    /** 다음 이동 한 번은 묻지 않는다 */
    allowNext() {
      allow.current = true
    },
  }
}

/**
 * 새 문서를 저장하는 동안 더 고친 내용(location.state.pendingDraft)을 넘겨받아, 문서를 불러온 뒤 한 번 반영한다
 * ('저장하지 않음' 으로 이어 간다). 반영하면 기록에서 지운다 — 새로고침 때 다시 덮지 않게.
 */
export function usePendingDraft(draft: DocumentDraft | null, edit: (patch: Partial<DocumentDraft>) => void) {
  const location = useLocation()
  const navigate = useNavigate()
  const pending = (location.state as { pendingDraft?: DocumentDraft } | null)?.pendingDraft
  useEffect(() => {
    if (!pending || !draft) return
    if (pending.title !== draft.title || JSON.stringify(pending.content) !== JSON.stringify(draft.content)) edit({ title: pending.title, content: pending.content })
    navigate(location.pathname, { replace: true, state: null })
  }, [pending, draft, edit, navigate, location.pathname])
}
