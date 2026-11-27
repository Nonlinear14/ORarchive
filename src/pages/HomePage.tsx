import { lazy, Suspense, useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from '../components/Icon'
import { PageHeading } from '../components/PageHeading'
import { useAuth } from '../lib/auth/context'
import { displayName } from '../lib/auth/helpers'
import { documentPath, type DocumentSummary } from '../lib/documents'
import { formatRelativeTime } from '../lib/format'
import { readRecentViews, recentOf, templateKinds, type RecentView } from '../lib/recentViews'
import { useDocumentContent } from '../lib/useDocumentContent'
import { useMyDocuments } from '../lib/useMyDocuments'
import './HomePage.css'

// 핸드아웃 캔버스·템플릿은 미리보기를 그릴 때만 불러온다 (첫 화면 번들을 가볍게)
const HandoutThumbnail = lazy(() => import('../features/handout/HandoutThumbnail'))

const RECENT_LIMIT = 4

const kindLabel: Record<RecentView['kind'], string> = {
  handout: '핸드아웃',
  roll20code: '롤꾸코드',
  character: '캐릭터',
}

/** 기록된 종류와 실제 문서 종류가 맞는지 (롤꾸코드 문서 종류는 아직 없다) */
const kindDocType: Record<RecentView['kind'], DocumentSummary['type'] | null> = {
  handout: 'handout',
  roll20code: null,
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
    <Link to={documentPath(doc.type, doc.id)} className="recent-card" aria-label={`${title} 열기`}>
      {view.kind === 'handout' ? <HandoutPreview id={doc.id} /> : <PreviewFallback label={kindLabel[view.kind]} />}
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
}: {
  id: string
  title: string
  description: string
  items: RecentItem[]
  loading: boolean
  more: { to: string; label: string }
  empty: ReactNode
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
    </section>
  )
}

/** 템플릿 목록 / 로그 목록 2분할 바로가기 */
function EditorLaunch() {
  return (
    <section className="editor-launch" aria-label="바로가기">
      <Link to="/templates" className="launch-tile launch-template">
        <span className="launch-kicker">TEMPLATE ARCHIVE</span>
        <strong>템플릿 목록</strong>
        <span className="launch-desc">만들어 둔 핸드아웃을 보고, 골라서 이어서 편집하거나 새로 시작해요.</span>
        <span className="launch-go">
          열기 <Icon name="arrow" />
        </span>
      </Link>
      <Link to="/logs" className="launch-tile launch-log">
        <span className="launch-kicker">LOG ARCHIVE</span>
        <strong>로그 목록</strong>
        <span className="launch-desc">불러온 Roll20·코코포리아 세션 기록을 열어 정리하고 HTML로 내보내요.</span>
        <span className="launch-go">
          열기 <Icon name="arrow" />
        </span>
      </Link>
    </section>
  )
}

/** / — 첫 화면: 목록 바로가기 · 최근 템플릿 · 최근 캐릭터 */
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
      <EditorLaunch />
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
      />
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
    </>
  )
}
