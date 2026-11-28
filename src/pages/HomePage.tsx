import { lazy, Suspense, useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { DocumentList } from '../components/DocumentList'
import { Icon } from '../components/Icon'
import { logPlatformChip } from '../lib/kindChips'
import { PageHeading } from '../components/PageHeading'
import { useAuth } from '../lib/auth/context'
import { displayName } from '../lib/auth/helpers'
import { documentPath, type DocumentSummary } from '../lib/documents'
import { formatRelativeTime } from '../lib/format'
import { readRecentViews, recentOf, templateKinds, type RecentView } from '../lib/recentViews'
import { useDocumentContent } from '../lib/useDocumentContent'
import { useMyDocuments } from '../lib/useMyDocuments'
import { isTouchOnly, usePressAccent } from '../lib/usePressAccent'
import './HomePage.css'

// 핸드아웃 캔버스·템플릿은 미리보기를 그릴 때만 불러온다 (첫 화면 번들을 가볍게)
const HandoutThumbnail = lazy(() => import('../features/handout/HandoutThumbnail'))
const Roll20CodePreview = lazy(() => import('../features/roll20code/Roll20CodePreview').then((m) => ({ default: m.Roll20CodePreview })))

const RECENT_LIMIT = 4

const kindLabel: Record<RecentView['kind'], string> = {
  handout: '핸드아웃',
  roll20code: '롤꾸코드',
  character: '캐릭터',
}

/** 기록된 종류와 실제 문서 종류가 맞는지 */
const kindDocType: Record<RecentView['kind'], DocumentSummary['type'] | null> = {
  handout: 'handout',
  roll20code: 'roll20code',
  character: 'character',
}

interface RecentItem {
  view: RecentView
  doc: DocumentSummary
}

/** 최근 기록 중 아직 남아 있는(삭제되지 않은) 문서만 */
function useRecentItems(docs: DocumentSummary[], ready: boolean) {
  const { user } = useAuth()
  return useMemo(() => {
    if (!user || !ready) return { templates: [], characters: [] }
    const byId = new Map(docs.map((doc) => [doc.id, doc]))
    const alive = readRecentViews(user.id).flatMap((view) => {
      const doc = byId.get(view.id)
      return doc && kindDocType[view.kind] === doc.type ? [{ view, doc }] : []
    })
    const pick = (kinds: RecentView['kind'][]): RecentItem[] => {
      const wanted = new Set(recentOf(alive.map((item) => item.view), kinds, RECENT_LIMIT).map((view) => view.id))
      return alive.filter((item) => wanted.has(item.view.id))
    }
    return { templates: pick(templateKinds), characters: pick(['character']) }
  }, [user, docs, ready])
}

function PreviewFallback({ label }: { label: string }) {
  return (
    <div className="recent-preview-empty" aria-hidden="true">
      <span>{label}</span>
    </div>
  )
}

function HandoutPreview({ id }: { id: string }) {
  const content = useDocumentContent(id)
  if (content === undefined) return <PreviewFallback label="불러오는 중…" />
  if (content === null) return <PreviewFallback label="미리보기를 불러오지 못했어요" />
  return (
    <Suspense fallback={<PreviewFallback label="불러오는 중…" />}>
      <HandoutThumbnail content={content} />
    </Suspense>
  )
}

function RecentCard({ item }: { item: RecentItem }) {
  const { view, doc } = item
  const title = doc.title.trim() || '제목 없음'
  return (
    <Link to={documentPath(doc.type, doc.id, doc.format)} className="recent-card" aria-label={`${title} 열기`}>
      {view.kind === 'handout' ? (
        <HandoutPreview id={doc.id} />
      ) : view.kind === 'roll20code' ? (
        <Suspense fallback={<PreviewFallback label="불러오는 중…" />}>
          <Roll20CodePreview id={doc.id} />
        </Suspense>
      ) : (
        <PreviewFallback label={kindLabel[view.kind]} />
      )}
      <div className="recent-info">
        <strong>{title}</strong>
        <small>
          {kindLabel[view.kind]} · {formatRelativeTime(new Date(view.at).toISOString())} 조회
        </small>
      </div>
    </Link>
  )
}

function RecentSection({
  id,
  title,
  description,
  items,
  loading,
  more,
  empty,
  actions,
}: {
  id: string
  title: string
  description: string
  items: RecentItem[]
  loading: boolean
  more: { to: string; label: string }
  empty: ReactNode
  /** 섹션 아래 바로가기 버튼 */
  actions?: ReactNode
}) {
  return (
    <section className="home-section" aria-labelledby={id}>
      <div className="section-top">
        <div>
          <h2 id={id}>{title}</h2>
          <p>{description}</p>
        </div>
        <Link to={more.to} className="text-link">
          {more.label} <Icon name="arrow" />
        </Link>
      </div>
      {loading ? (
        <div className="recent-grid" aria-busy="true">
          {Array.from({ length: RECENT_LIMIT }, (_, i) => (
            <div key={i} className="recent-card skeleton" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="recent-grid">
          {items.map((item) => (
            <RecentCard key={item.view.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="recent-empty">{empty}</div>
      )}
      {actions}
    </section>
  )
}

/** 섹션 아래 편집 메뉴 바로가기 (설명 없이 이름만). 예전 홈 바로가기 카드처럼 2칸 폭의 큰 버튼. 준비 중인 메뉴는 누를 수 없게 */
function HomeActions({ tone, items }: { tone: 'template' | 'log'; items: { to: string; label: string; ready?: boolean }[] }) {
  const navigate = useNavigate()
  const { pressed, press } = usePressAccent()
  return (
    <div className={`home-actions tone-${tone}`}>
      {items.map((item) =>
        item.ready === false ? (
          <span key={item.to} className="home-action is-disabled" aria-disabled="true" role="link" title="준비 중이에요">
            <strong>{item.label}</strong>
            <span className="tag">준비 중</span>
          </span>
        ) : (
          <Link
            key={item.to}
            to={item.to}
            className={`home-action press-accent${pressed === item.to ? ' is-pressed' : ''}`}
            onClick={(event) => {
              // 새 탭 열기 등 수정키 · 가운데 버튼은 브라우저에 맡긴다
              // 마우스가 있는 기기는 링크가 곧바로 이동한다
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !isTouchOnly()) return
              event.preventDefault()
              press(item.to, () => navigate(item.to))
            }}
          >
            <strong>{item.label}</strong>
            <Icon name="arrow" />
          </Link>
        ),
      )}
    </div>
  )
}

const RECENT_LOGS = 4

/** 로그 아카이브: 최근 수정한 로그 4건 (목록 보기) */
function LogSection({ docs, loading }: { docs: DocumentSummary[]; loading: boolean }) {
  const logs = docs
    .filter((doc) => doc.type === 'log')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, RECENT_LOGS)
  return (
    <section className="home-section" aria-labelledby="home-logs">
      <div className="section-top">
        <div>
          <h2 id="home-logs">로그 아카이브</h2>
          <p>최근 수정한 로그</p>
        </div>
        <Link to="/logs" className="text-link">
          로그 보기 <Icon name="arrow" />
        </Link>
      </div>
      {loading ? (
        <div className="recent-empty" aria-busy="true">
          불러오는 중…
        </div>
      ) : logs.length > 0 ? (
        <DocumentList docs={logs} showVisibility={false} kindColumn={{ label: '플랫폼', chip: logPlatformChip }} />
      ) : (
        <div className="recent-empty">아직 로그가 없어요.</div>
      )}
      <HomeActions
        tone="log"
        items={[
          { to: '/studio/log/roll20', label: 'Roll20 로그 편집' },
          { to: '/studio/log/ccfolia', label: '코코포리아 로그 편집' },
        ]}
      />
    </section>
  )
}

/** / — 첫 화면 (2026-11-28): 캐릭터 아카이브 → 로그 아카이브(최근 수정 4건) → 템플릿 아카이브(최근 연 4개) */
export function HomePage() {
  const { user, profile } = useAuth()
  const { status, docs, error, reload } = useMyDocuments()
  const { templates, characters } = useRecentItems(docs, status === 'ready')
  const loading = status === 'loading'

  return (
    <>
      <PageHeading title="홈" description={`${displayName(user, profile)}님, 최근 작업을 이어서 열어 보세요.`} />
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
      <RecentSection
        id="home-characters"
        title="캐릭터 아카이브"
        description="최근에 연 캐릭터"
        items={characters}
        loading={loading}
        more={{ to: '/characters', label: '캐릭터 보기' }}
        empty={
          <>
            아직 캐릭터가 없어요.
            <br />
            <small>캐릭터 시트는 준비 중이에요.</small>
          </>
        }
      />
      <LogSection docs={docs} loading={loading} />
      <RecentSection
        id="home-templates"
        title="템플릿 아카이브"
        description="최근에 연 핸드아웃과 롤꾸코드"
        items={templates}
        loading={loading}
        more={{ to: '/templates', label: '템플릿 보기' }}
        empty={
          <>
            아직 열어 본 템플릿이 없어요.
            <br />
            <Link to="/templates" className="text-link">
              템플릿 목록에서 시작하기 <Icon name="arrow" />
            </Link>
          </>
        }
        actions={
          <HomeActions
            tone="template"
            items={[
              { to: '/studio/handout', label: '핸드아웃 편집' },
              { to: '/studio/roll20code', label: '롤꾸코드 편집' },
            ]}
          />
        }
      />
    </>
  )
}
