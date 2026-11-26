import { useState } from 'react'
import { Link } from 'react-router'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { DocumentList } from '../../../components/DocumentList'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeading } from '../../../components/PageHeading'
import { documentPath, type DocumentSummary } from '../../../lib/documents'
import { formatRelativeTime } from '../../../lib/format'
import { useDocumentContent } from '../../../lib/useDocumentContent'
import { useMyDocuments } from '../../../lib/useMyDocuments'
import { useRepository } from '../../../lib/useRepository'
import HandoutThumbnail from '../HandoutThumbnail'
import { TemplatePicker } from './TemplatePicker'

type ArchiveView = 'grid' | 'list'
const VIEW_STORAGE_KEY = 'folio-archive-view'

function readView(): ArchiveView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

/** 오른쪽 위 보기 방식 토글 (이 기기에 기억) */
function ViewToggle({ view, onChange }: { view: ArchiveView; onChange(view: ArchiveView): void }) {
  const options: [ArchiveView, string][] = [
    ['grid', '미리보기'],
    ['list', '목록'],
  ]
  return (
    <div className="segmented view-toggle" role="radiogroup" aria-label="보기 방식">
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={view === value}
          className={view === value ? 'active' : ''}
          onClick={() => onChange(value)}
        >
          <Icon name={value === 'grid' ? 'home' : 'library'} />
          {label}
        </button>
      ))}
    </div>
  )
}

function HandoutPreview({ id }: { id: string }) {
  const content = useDocumentContent(id)
  if (content === undefined)
    return (
      <div className="recent-preview-empty" aria-hidden="true">
        <span>불러오는 중…</span>
      </div>
    )
  if (content === null)
    return (
      <div className="recent-preview-empty" aria-hidden="true">
        <span>미리보기를 불러오지 못했어요</span>
      </div>
    )
  return <HandoutThumbnail content={content} />
}

function HandoutCard({ doc, onDelete }: { doc: DocumentSummary; onDelete(doc: DocumentSummary): void }) {
  const title = doc.title.trim() || '제목 없음'
  return (
    <article className="handout-card">
      <Link to={documentPath(doc.type, doc.id)} className="handout-card-open" aria-label={`${title} 열기`}>
        <HandoutPreview id={doc.id} />
      </Link>
      <div className="handout-card-info">
        <div>
          <strong>{title}</strong>
          <small>
            <time dateTime={doc.updated_at}>{formatRelativeTime(doc.updated_at)}</time> 수정
          </small>
        </div>
        <button type="button" className="row-icon" aria-label={`${title} 삭제`} title="삭제" onClick={() => onDelete(doc)}>
          <Icon name="trash" />
        </button>
      </div>
    </article>
  )
}

/** /templates — 템플릿 아카이브 › 핸드아웃: 기본 템플릿으로 새로 시작 + 내 핸드아웃 (미리보기/목록) */
export default function HandoutArchivePage() {
  const repo = useRepository()
  const { status, docs, error, reload, removeLocal } = useMyDocuments()
  const [view, setView] = useState<ArchiveView>(readView)
  const [deleting, setDeleting] = useState<DocumentSummary | null>(null)
  const handouts = docs.filter((doc) => doc.type === 'handout')

  function changeView(next: ArchiveView) {
    setView(next)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // 기억하지 못해도 이번 방문에는 적용된다
    }
  }

  return (
    <>
      <PageHeading
        title="핸드아웃"
        eyebrow="TEMPLATE ARCHIVE / HANDOUT"
        description="기본 템플릿으로 새로 시작하거나, 만들어 둔 핸드아웃을 이어서 편집하세요."
        action={<ViewToggle view={view} onChange={changeView} />}
      />

      <section aria-labelledby="archive-new">
        <div className="section-top">
          <div>
            <h2 id="archive-new">새로 시작</h2>
            <p>모든 템플릿은 글자 · 테마 · 강조 색 · 글꼴을 바꿔 쓸 수 있어요.</p>
          </div>
        </div>
        <TemplatePicker />
      </section>

      <section aria-labelledby="archive-mine">
        <div className="section-top">
          <div>
            <h2 id="archive-mine">내 핸드아웃</h2>
            <p>{status === 'ready' ? `핸드아웃 ${handouts.length}개 · 열면 템플릿 에디터에서 이어서 편집해요` : ' '}</p>
          </div>
        </div>
        {status === 'loading' && <LoadingState label="내 핸드아웃을 불러오는 중…" />}
        {status === 'error' && (
          <div className="callout danger" role="alert">
            <Icon name="alert" />
            <span>
              핸드아웃 목록을 불러오지 못했어요. ({error}){' '}
              <button type="button" className="text-link" onClick={reload}>
                다시 시도
              </button>
            </span>
          </div>
        )}
        {status === 'ready' &&
          (handouts.length === 0 ? (
            <div className="library-list empty">아직 만든 핸드아웃이 없어요. 위의 템플릿으로 시작해 보세요.</div>
          ) : view === 'grid' ? (
            <div className="handout-grid">
              {handouts.map((doc) => (
                <HandoutCard key={doc.id} doc={doc} onDelete={setDeleting} />
              ))}
            </div>
          ) : (
            <DocumentList docs={handouts} onDelete={setDeleting} />
          ))}
      </section>

      {deleting && (
        <ConfirmDialog
          title="핸드아웃을 삭제할까요?"
          message={
            <>
              <b>{deleting.title || '제목 없음'}</b> 핸드아웃을 삭제합니다. 모든 기기에서 사라져요.
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
