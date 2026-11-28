import { Link } from 'react-router'
import type { DocumentType } from '../lib/database.types'
import { documentPath, documentTypeLabels, visibilityLabels, type DocumentSummary } from '../lib/documents'
import { formatRelativeTime } from '../lib/format'
import { Icon, type IconName } from './Icon'
import './DocumentList.css'

const typeIcon: Record<DocumentType, IconName> = { handout: 'handout', log: 'logs', character: 'characters', roll20code: 'code' }
const squareTone: Record<DocumentType, string> = { handout: '', log: 'log', character: 'char', roll20code: 'code' }

interface DocumentListProps {
  docs: DocumentSummary[]
  /** 지정하면 각 행에 삭제 버튼을 보여준다 */
  onDelete?(doc: DocumentSummary): void
  /** 지정하면 행을 눌렀을 때 화면을 옮기지 않고 이 함수를 부른다 (미리보기 창 등) */
  onOpen?(doc: DocumentSummary): void
  /** 두 번째 칸(기본: 유형)을 컬러칩으로 — 예: 템플릿 목록의 유형, 로그 목록의 플랫폼 */
  kindColumn?: { label: string; chip(doc: DocumentSummary): KindChipValue }
  /** 공개 범위 칸 (기본 보임) */
  showVisibility?: boolean
}

export type ChipTone = 'green' | 'brown'
export interface KindChipValue {
  label: string
  tone: ChipTone
}

/** 종류 구분 컬러칩 (핸드아웃·Roll20 = 녹색, 롤꾸코드·코코포리아 = 갈색) */
export function KindChip({ label, tone }: KindChipValue) {
  return <span className={`kind-chip tone-${tone}`}>{label}</span>
}

/** 목업의 library-list (이름 · 유형 · 공개 범위 · 수정 날짜) */
export function DocumentList({ docs, onDelete, onOpen, kindColumn, showVisibility = true }: DocumentListProps) {
  return (
    <div className={showVisibility ? 'library-list' : 'library-list no-visibility'} role="table" aria-label="문서 목록">
      <div className="list-head" role="row">
        <div role="columnheader">이름</div>
        <div role="columnheader">{kindColumn?.label ?? '유형'}</div>
        {showVisibility && <div role="columnheader">공개 범위</div>}
        <div role="columnheader">수정 날짜</div>
        <div role="columnheader">
          <span className="sr-only">작업</span>
        </div>
      </div>
      {docs.map((doc) => (
        <div className="list-row" role="row" key={doc.id}>
          <div role="cell">
            {onOpen ? (
              <button type="button" className="item-title item-title-button" onClick={() => onOpen(doc)}>
                <span className={`item-square ${squareTone[doc.type]}`} aria-hidden="true">
                  <Icon name={typeIcon[doc.type]} />
                </span>
                <span className="item-name">{doc.title.trim() || '제목 없음'}</span>
              </button>
            ) : (
              <Link to={documentPath(doc.type, doc.id)} className="item-title">
                <span className={`item-square ${squareTone[doc.type]}`} aria-hidden="true">
                  <Icon name={typeIcon[doc.type]} />
                </span>
                <span className="item-name">{doc.title.trim() || '제목 없음'}</span>
              </Link>
            )}
          </div>
          <div role="cell" className="cell-kind">
            {kindColumn ? <KindChip {...kindColumn.chip(doc)} /> : documentTypeLabels[doc.type]}
          </div>
          {showVisibility && (
            <div role="cell" className="cell-visibility">
              <span className={doc.visibility === 'private' ? 'tag' : 'tag gold'}>{visibilityLabels[doc.visibility]}</span>
            </div>
          )}
          <div role="cell" className="cell-date">
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
            {onOpen ? (
              <button
                type="button"
                className="row-icon"
                aria-label={`${doc.title || '제목 없음'} 미리보기`}
                title="미리보기"
                onClick={() => onOpen(doc)}
              >
                <Icon name="chev" />
              </button>
            ) : (
              <Link to={documentPath(doc.type, doc.id)} className="row-icon" aria-label={`${doc.title || '제목 없음'} 열기`} title="열기">
                <Icon name="chev" />
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
