import { useState } from 'react'
import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import { DocumentList } from '../../../../components/DocumentList'
import { Icon } from '../../../../components/Icon'
import { LoadingState } from '../../../../components/LoadingState'
import { PageHeading } from '../../../../components/PageHeading'
import type { DocumentSummary } from '../../../../lib/documents'
import { useMyDocuments } from '../../../../lib/useMyDocuments'
import { useRepository } from '../../../../lib/useRepository'
import '../roll20Log.css'
import { ImportLogDialog } from './ImportLogDialog'

/** /studio/log/roll20 — 로그 에디터 › Roll20 로그 편집: 내 로그 목록 + 새 로그 불러오기 */
export default function Roll20LogListPage() {
  const repo = useRepository()
  const { status, docs, error, reload, removeLocal } = useMyDocuments()
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState<DocumentSummary | null>(null)
  const logs = docs.filter((doc) => doc.type === 'log')

  return (
    <>
      <PageHeading
        title="Roll20 로그 편집"
        eyebrow="LOG EDITOR / ROLL20"
        description="Roll20 채팅 아카이브를 불러와 다듬고, HTML 파일이나 블로그용 코드로 내보내세요."
        action={
          <button type="button" className="btn primary" onClick={() => setImporting(true)}>
            <Icon name="plus" /> 새 로그 불러오기
          </button>
        }
      />
      <section aria-labelledby="logs-mine">
        <div className="section-top">
          <div>
            <h2 id="logs-mine">내 Roll20 로그</h2>
            <p>{status === 'ready' ? `로그 ${logs.length}개 · 열면 로그 에디터에서 이어서 편집해요` : ' '}</p>
          </div>
        </div>
        {status === 'loading' && <LoadingState label="내 로그를 불러오는 중…" />}
        {status === 'error' && (
          <div className="callout danger" role="alert">
            <Icon name="alert" />
            <span>
              로그 목록을 불러오지 못했어요. ({error}){' '}
              <button type="button" className="text-link" onClick={reload}>
                다시 시도
              </button>
            </span>
          </div>
        )}
        {status === 'ready' &&
          (logs.length === 0 ? (
            <div className="library-list empty">
              아직 불러온 로그가 없어요.
              <br />
              <button type="button" className="text-link" onClick={() => setImporting(true)}>
                Roll20 채팅 로그 불러오기 <Icon name="arrow" />
              </button>
            </div>
          ) : (
            <DocumentList docs={logs} onDelete={setDeleting} typeColumn={{ label: '룰', value: (doc) => doc.rule?.trim() || '기타' }} />
          ))}
      </section>
      {importing && <ImportLogDialog onClose={() => setImporting(false)} />}
      {deleting && (
        <ConfirmDialog
          title="로그를 삭제할까요?"
          message={
            <>
              <b>{deleting.title || '제목 없음'}</b> 로그를 삭제합니다. 모든 기기에서 사라져요.
            </>
          }
          confirmLabel="삭제"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await repo.softDelete(deleting.id)
            removeLocal(deleting.id)
            setDeleting(null)
          }}
        />
      )}
    </>
  )
}
