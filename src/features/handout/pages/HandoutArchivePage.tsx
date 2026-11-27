import { useState } from 'react'
import { Link } from 'react-router'
import { Modal } from '../../../components/Modal'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { DocumentList, KindChip } from '../../../components/DocumentList'
import { ListSearch } from '../../../components/ListSearch'
import { matchesTitle } from '../../../lib/listSearch'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeading } from '../../../components/PageHeading'
import { documentPath, type DocumentSummary } from '../../../lib/documents'
import { formatRelativeTime } from '../../../lib/format'
import { useMyDocuments } from '../../../lib/useMyDocuments'
import { useRepository } from '../../../lib/useRepository'
import { templateKindChips } from '../../../lib/kindChips'
import { HandoutPreview } from '../HandoutPreview'
import { useCopyHandout } from '../useCopyHandout'
import { useSeedSampleHandout } from '../useSeedSampleHandout'
import { TemplatePickerDialog } from './TemplatePicker'

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
        <button key={value} type="button" role="radio" aria-checked={view === value} className={view === value ? 'active' : ''} onClick={() => onChange(value)}>
          <Icon name={value === 'grid' ? 'home' : 'library'} />
          {label}
        </button>
      ))}
    </div>
  )
}

function HandoutCard({ doc, onOpen, onDelete }: { doc: DocumentSummary; onOpen(doc: DocumentSummary): void; onDelete(doc: DocumentSummary): void }) {
  const title = doc.title.trim() || '제목 없음'
  return (
    <article className="handout-card">
      <button type="button" className="handout-card-open" aria-label={`${title} 미리보기`} onClick={() => onOpen(doc)}>
        <HandoutPreview id={doc.id} />
      </button>
      <div className="handout-card-info">
        <div>
          <span className="handout-card-name">
            <strong>{title}</strong>
            <KindChip {...templateKindChips.handout} />
          </span>
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

/** 핸드아웃을 고르면 뜨는 창: 크게 미리보기 + 이 템플릿 사용하기(사본으로 편집) / 원본 편집 */
function HandoutPreviewDialog({ doc, onClose }: { doc: DocumentSummary; onClose(): void }) {
  const { copy, busy, error } = useCopyHandout()
  const title = doc.title.trim() || '제목 없음'
  return (
    <Modal title={title} eyebrow="TEMPLATE ARCHIVE / HANDOUT" onClose={onClose} wide>
      <div className="handout-preview-stage">
        <HandoutPreview id={doc.id} />
      </div>
      <p className="handout-preview-meta">{formatRelativeTime(doc.updated_at)} 수정 · "이 템플릿 사용하기"는 사본을 만들어 편집해요. 원본은 그대로 남아요.</p>
      {error && (
        <div className="callout danger gallery-error" role="alert">
          <Icon name="alert" />
          <span>사본을 만들지 못했어요: {error}</span>
        </div>
      )}
      <div className="handout-preview-actions">
        <Link to={documentPath(doc.type, doc.id)} className="btn">
          <Icon name="edit" /> 원본 편집
        </Link>
        <button type="button" className="btn primary" onClick={() => void copy(doc.id)} disabled={busy}>
          <Icon name="copy" /> {busy ? '사본을 만드는 중…' : '이 템플릿 사용하기'}
        </button>
      </div>
    </Modal>
  )
}

/** /templates — 템플릿 아카이브 › 템플릿 목록 (지금은 핸드아웃만, 롤꾸코드는 나중에): 내 핸드아웃 (미리보기/목록). 고르면 미리보기 창 */
export default function HandoutArchivePage() {
  const repo = useRepository()
  const { status, docs, error, reload, removeLocal } = useMyDocuments()
  const [view, setView] = useState<ArchiveView>(readView)
  const [deleting, setDeleting] = useState<DocumentSummary | null>(null)
  const [previewing, setPreviewing] = useState<DocumentSummary | null>(null)
  const [picking, setPicking] = useState(false)
  const handouts = docs.filter((doc) => doc.type === 'handout')
  const [query, setQuery] = useState('')
  const shown = handouts.filter((doc) => matchesTitle(doc.title, query))
  useSeedSampleHandout(status === 'ready', handouts.length, reload)

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
        title="템플릿 목록"
        eyebrow="TEMPLATE ARCHIVE / LIST"
        description="만들어 둔 핸드아웃을 골라 미리 보고, 템플릿으로 다시 쓰거나 이어서 편집하세요."
        action={
          <div className="archive-actions">
            <ViewToggle view={view} onChange={changeView} />
            <button type="button" className="btn primary" onClick={() => setPicking(true)}>
              <Icon name="plus" /> 새 핸드아웃
            </button>
          </div>
        }
      />

      <section aria-labelledby="archive-mine">
        <div className="section-top">
          <div>
            <h2 id="archive-mine">내 핸드아웃</h2>
            <p>
              {status === 'ready'
                ? `핸드아웃 ${query.trim() ? `${handouts.length}개 중 ${shown.length}개` : `${handouts.length}개`} · 고르면 미리보기가 열려요`
                : ' '}
            </p>
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
            <div className="library-list empty">
              아직 만든 핸드아웃이 없어요.
              <br />
              <button type="button" className="text-link" onClick={() => setPicking(true)}>
                템플릿을 골라 새 핸드아웃 만들기 <Icon name="arrow" />
              </button>
            </div>
          ) : (
            <>
              <ListSearch label="템플릿 목록 검색" value={query} onChange={setQuery} />
              {shown.length === 0 ? (
                <div className="list-search-empty" role="status">
                  이름이 맞는 핸드아웃이 없어요. 다른 검색어로 찾아보세요.
                </div>
              ) : view === 'grid' ? (
                <div className="handout-grid">
                  {shown.map((doc) => (
                    <HandoutCard key={doc.id} doc={doc} onOpen={setPreviewing} onDelete={setDeleting} />
                  ))}
                </div>
              ) : (
                <DocumentList
                  docs={shown}
                  onOpen={setPreviewing}
                  onDelete={setDeleting}
                  kindColumn={{ label: '유형', chip: () => templateKindChips.handout }}
                />
              )}
            </>
          ))}
      </section>

      {previewing && <HandoutPreviewDialog doc={previewing} onClose={() => setPreviewing(null)} />}
      {picking && <TemplatePickerDialog onClose={() => setPicking(false)} />}
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
