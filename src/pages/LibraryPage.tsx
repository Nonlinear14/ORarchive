import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DocumentList } from '../components/DocumentList'
import { Icon } from '../components/Icon'
import { LoadingState } from '../components/LoadingState'
import { NewDocumentDialog } from '../components/NewDocumentDialog'
import { PageHeading } from '../components/PageHeading'
import type { DocumentType } from '../lib/database.types'
import { documentTypeLabels, documentTypes, type DocumentSummary } from '../lib/documents'
import { useMyDocuments } from '../lib/useMyDocuments'
import { useRepository } from '../lib/useRepository'
import './LibraryPage.css'

type Filter = DocumentType | 'all'

const filters: [Filter, string][] = [['all', '전체 문서'], ...documentTypes.map((t): [Filter, string] => [t, documentTypeLabels[t]])]

function isDocumentType(value: string | null): value is DocumentType {
  return value !== null && (documentTypes as string[]).includes(value)
}

export function LibraryPage() {
  const repo = useRepository()
  const { status, docs, error, reload, removeLocal } = useMyDocuments()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [deleting, setDeleting] = useState<DocumentSummary | null>(null)

  // ?new=handout 으로 들어오면 새 문서 창을 바로 연다 (대시보드 버튼)
  const newParam = params.get('new')
  const creatingType = isDocumentType(newParam) ? newParam : newParam !== null ? 'handout' : null

  function openNew() {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('new', filter === 'all' ? 'handout' : filter)
      return next
    })
  }

  function closeNew() {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('new')
        return next
      },
      { replace: true },
    )
  }

  const needle = query.trim().toLocaleLowerCase('ko-KR')
  const visible = docs.filter(
    (doc) =>
      (filter === 'all' || doc.type === filter) &&
      (!needle || doc.title.toLocaleLowerCase('ko-KR').includes(needle)),
  )

  return (
    <>
      <PageHeading
        title="내 보관함"
        description="내가 만든 모든 자료를 한곳에서 찾아보고 관리하세요."
        action={
          <button type="button" className="btn primary" onClick={openNew}>
            <Icon name="plus" /> 새 문서
          </button>
        }
      />
      <div className="section-top">
        <div>
          <h2>문서 목록</h2>
          <p>{status === 'ready' ? `문서 ${docs.length}개 · 모두 내 계정에 비공개로 저장됨` : ' '}</p>
        </div>
        <label className="searchbar">
          <Icon name="search" />
          <span className="sr-only">문서 제목으로 검색</span>
          <input
            type="search"
            placeholder="문서 제목으로 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="filters" role="group" aria-label="유형 필터">
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={filter === key ? 'filter active' : 'filter'}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {status === 'loading' && <LoadingState label="내 문서를 불러오는 중…" />}
      {status === 'error' && (
        <div className="callout danger" role="alert">
          <Icon name="alert" />
          <span>
            문서 목록을 불러오지 못했어요. ({error}){' '}
            <button type="button" className="text-link" onClick={reload}>
              다시 시도
            </button>
          </span>
        </div>
      )}
      {status === 'ready' &&
        (visible.length > 0 ? (
          <DocumentList docs={visible} onDelete={setDeleting} />
        ) : (
          <div className="library-list empty">
            {docs.length === 0 ? '아직 만든 문서가 없어요. 오른쪽 위 “새 문서”로 시작해 보세요.' : '조건에 맞는 문서가 없어요.'}
          </div>
        ))}

      {creatingType && <NewDocumentDialog initialType={creatingType} onClose={closeNew} />}
      {deleting && (
        <ConfirmDialog
          title="문서를 삭제할까요?"
          message={
            <>
              <b>{deleting.title || '제목 없음'}</b> 문서를 보관함에서 삭제합니다. 모든 기기에서 사라져요.
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
