import { Link } from 'react-router'
import type { DocumentType } from '../lib/database.types'
import { documentPath, documentTypeLabels, visibilityLabels, type DocumentSummary } from '../lib/documents'
import { formatRelativeTime } from '../lib/format'
import { Icon, type IconName } from './Icon'
import './DocumentList.css'

const typeIcon: Record<DocumentType, IconName> = { handout: 'handout', log: 'logs', character: 'characters' }
const squareTone: Record<DocumentType, string> = { handout: '', log: 'log', character: 'char' }

interface DocumentListProps {
  docs: DocumentSummary[]
  /** 지정하면 각 행에 삭제 버튼을 보여준다 */
  onDelete?(doc: DocumentSummary): void
}

/** 목업의 library-list (이름 · 유형 · 공개 범위 · 수정 날짜) */
export function DocumentList({ docs, onDelete }: DocumentListProps) {
  return (
    <div className="library-list" role="table" aria-label="문서 목록">
      <div className="list-head" role="row">
        <div role="columnheader">이름</div>
        <div role="columnheader">유형</div>
        <div role="columnheader">공개 범위</div>
        <div role="columnheader">수정 날짜</div>
        <div role="columnheader">
          <span className="sr-only">작업</span>
        </div>
      </div>
      {docs.map((doc) => (
        <div className="list-row" role="row" key={doc.id}>
          <div role="cell">
            <Link to={documentPath(doc.type, doc.id)} className="item-title">
              <span className={`item-square ${squareTone[doc.type]}`} aria-hidden="true">
                <Icon name={typeIcon[doc.type]} />
              </span>
              <span className="item-name">{doc.title.trim() || '제목 없음'}</span>
            </Link>
          </div>
          <div role="cell">{documentTypeLabels[doc.type]}</div>
          <div role="cell">
            <span className={doc.visibility === 'private' ? 'tag' : 'tag gold'}>{visibilityLabels[doc.visibility]}</span>
          </div>
          <div role="cell">
            <time dateTime={doc.updated_at} title={new Date(doc.updated_at).toLocaleString('ko-KR')}>
              {formatRelativeTime(doc.updated_at)}
            </time>
          </div>
          <div role="cell" className="list-actions">
            {onDelete && (
              <button
                type="button"
                className="row-icon"
                aria-label={`${doc.title || '제목 없음'} 삭제`}
                title="삭제"
                onClick={() => onDelete(doc)}
              >
                <Icon name="trash" />
              </button>
            )}
            <Link to={documentPath(doc.type, doc.id)} className="row-icon" aria-label={`${doc.title || '제목 없음'} 열기`} title="열기">
              <Icon name="chev" />
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
