import { useMemo, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { Modal } from '../../../components/Modal'
import type { DocumentSummary } from '../../../lib/documents'
import { useMyDocuments } from '../../../lib/useMyDocuments'
import { BlockCanvas } from '../canvas/BlockCanvas'
import { HandoutPreview } from '../HandoutPreview'
import { layoutOf } from '../layout'
import { createHandoutContent, handoutTemplates } from '../templates'
import { useCopyHandout } from '../useCopyHandout'
import { useCreateHandout } from '../useCreateHandout'
import './TemplateGalleryPage.css'

/** 카드: 미리보기 · 이름 · "이 템플릿 사용하기" */
function PickCard({
  id,
  title,
  preview,
  busy,
  disabled,
  onUse,
}: {
  id: string
  title: string
  preview: React.ReactNode
  busy: boolean
  disabled: boolean
  onUse(): void
}) {
  return (
    <article className="template-card compact pick-card" aria-labelledby={`pick-${id}`}>
      {preview}
      <div className="template-info">
        <strong id={`pick-${id}`}>{title}</strong>
        <button type="button" className="btn primary small template-start" onClick={onUse} disabled={disabled} aria-label={`${title} — 이 템플릿 사용하기`}>
          <Icon name="copy" /> {busy ? '사본을 만드는 중…' : '이 템플릿 사용하기'}
        </button>
      </div>
    </article>
  )
}

/** 내 핸드아웃이 아직 없을 때만: 기본 템플릿 (기본 템플릿 핸드아웃을 지정하기 전까지 쓰는 임시 목록) */
function StarterTemplates({ query }: { query: string }) {
  const { create, busy, error } = useCreateHandout()
  const list = handoutTemplates.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
  const layouts = useMemo(() => new Map(handoutTemplates.map((t) => [t.id, layoutOf(createHandoutContent(t.id))])), [])
  return (
    <>
      {error && (
        <div className="callout danger gallery-error" role="alert">
          <Icon name="alert" />
          <span>핸드아웃을 만들지 못했어요: {error}</span>
        </div>
      )}
      <div className="template-grid">
        {list.map((t) => (
          <PickCard
            key={t.id}
            id={t.id}
            title={t.name}
            busy={busy === t.id}
            disabled={busy !== null}
            onUse={() => void create(t.id)}
            preview={
              <div className={`template-preview tp-${t.id}`} aria-hidden="true">
                <div className="template-preview-scale">
                  <BlockCanvas layout={layouts.get(t.id)!} />
                </div>
              </div>
            }
          />
        ))}
      </div>
    </>
  )
}

/**
 * 템플릿 선택: 템플릿 아카이브 › 핸드아웃의 내 핸드아웃 목록 (최근 수정순, 열 때마다 새로 불러온다) + 이름 검색.
 * "이 템플릿 사용하기"는 아카이브와 같다: 사본을 만들어 템플릿 에디터를 연다. 원본은 그대로.
 */
export function TemplatePicker() {
  const { status, docs, error, reload } = useMyDocuments()
  const { copy, busy, error: copyError } = useCopyHandout()
  const [using, setUsing] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const handouts = docs.filter((doc) => doc.type === 'handout')
  const q = query.trim().toLowerCase()
  const titleOf = (doc: DocumentSummary) => doc.title.trim() || '제목 없음'
  const visible = handouts.filter((doc) => titleOf(doc).toLowerCase().includes(q))

  return (
    <>
      <label className="searchbar picker-search">
        <Icon name="search" />
        <span className="sr-only">템플릿 검색</span>
        <input type="search" placeholder="이름으로 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {copyError && (
        <div className="callout danger gallery-error" role="alert">
          <Icon name="alert" />
          <span>사본을 만들지 못했어요: {copyError}</span>
        </div>
      )}
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
      {status === 'ready' && handouts.length === 0 && (
        <>
          <div className="picker-empty" role="status">
            아직 템플릿 아카이브에 핸드아웃이 없어요. 아래 기본 템플릿으로 시작해 보세요.
          </div>
          <StarterTemplates query={query} />
        </>
      )}
      {status === 'ready' && handouts.length > 0 && visible.length === 0 && (
        <div className="picker-empty" role="status">
          이름이 맞는 핸드아웃이 없어요. 다른 검색어로 찾아보세요.
        </div>
      )}
      {status === 'ready' && visible.length > 0 && (
        <div className="template-grid">
          {visible.map((doc) => (
            <PickCard
              key={doc.id}
              id={doc.id}
              title={titleOf(doc)}
              busy={busy && using === doc.id}
              disabled={busy}
              onUse={() => {
                setUsing(doc.id)
                void copy(doc.id)
              }}
              preview={<HandoutPreview id={doc.id} />}
            />
          ))}
        </div>
      )}
    </>
  )
}

/** 템플릿 선택 창 (템플릿 에디터 메뉴 · 템플릿 아카이브의 새 핸드아웃 버튼) */
export function TemplatePickerDialog({ onClose }: { onClose(): void }) {
  return (
    <Modal title="템플릿 선택" eyebrow="TEMPLATE EDITOR" onClose={onClose} wide>
      <p>템플릿 아카이브의 핸드아웃을 골라 사본으로 새 핸드아웃을 만들고 바로 편집기를 열어요. 원본은 그대로 남아요.</p>
      <div className="picker-in-modal">
        <TemplatePicker />
      </div>
    </Modal>
  )
}
