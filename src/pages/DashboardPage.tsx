import { Link } from 'react-router'
import { DocumentList } from '../components/DocumentList'
import { Icon } from '../components/Icon'
import { LoadingState } from '../components/LoadingState'
import { PageHeading } from '../components/PageHeading'
import { useAuth } from '../lib/auth/context'
import { displayName } from '../lib/auth/helpers'
import { documentTypes, documentTypeLabels, type DocumentSummary } from '../lib/documents'
import { useMyDocuments } from '../lib/useMyDocuments'
import './DashboardPage.css'

const RECENT_COUNT = 5

function StatGrid({ docs }: { docs: DocumentSummary[] }) {
  const stats: [string, number][] = [
    ['전체 문서', docs.length],
    ...documentTypes.map((type): [string, number] => [
      documentTypeLabels[type],
      docs.filter((doc) => doc.type === type).length,
    ]),
  ]
  return (
    <div className="stat-grid">
      {stats.map(([label, count]) => (
        <div className="stat" key={label}>
          <div className="stat-label">{label}</div>
          <div className="stat-val" aria-label={`${label} ${count}개`}>
            {String(count).padStart(2, '0')} <small>개</small>
          </div>
        </div>
      ))}
    </div>
  )
}

function RecentDocuments() {
  const { status, docs, error, reload } = useMyDocuments()

  if (status === 'loading') return <LoadingState label="내 문서를 불러오는 중…" />
  if (status === 'error')
    return (
      <div className="callout danger" role="alert">
        <Icon name="alert" />
        <span>
          문서 목록을 불러오지 못했어요. ({error}){' '}
          <button type="button" className="text-link" onClick={reload}>
            다시 시도
          </button>
        </span>
      </div>
    )

  return (
    <>
      <StatGrid docs={docs} />
      <div className="section-top">
        <div>
          <h2>최근 작업</h2>
          <p>이전에 작업하던 곳에서 이어서 편집할 수 있어요.</p>
        </div>
        <Link to="/library" className="text-link">
          전체 보기 <Icon name="arrow" />
        </Link>
      </div>
      {docs.length === 0 ? (
        <div className="library-list empty">
          아직 만든 문서가 없어요.
          <br />
          <Link to="/library?new=handout" className="text-link">
            첫 문서 만들기 <Icon name="arrow" />
          </Link>
        </div>
      ) : (
        <DocumentList docs={docs.slice(0, RECENT_COUNT)} />
      )}
    </>
  )
}

export function DashboardPage() {
  const { user, profile } = useAuth()

  return (
    <>
      <PageHeading
        title="대시보드"
        description={`${displayName(user, profile)}님의 모든 이야기와 창작물을 한 곳에서 관리하세요.`}
      />
      <section className="hero">
        <div className="hero-content">
          <div className="hero-kicker">YOUR STORIES, BEAUTIFULLY KEPT</div>
          <h2>
            흩어진 서사를,
            <br />
            하나의 서재에.
          </h2>
          <p>
            핸드아웃부터 세션 로그, 캐릭터 시트까지.
            <br />
            모든 순간을 만들고, 다듬고, 간직해 보세요.
          </p>
          <div className="hero-btns">
            <Link to="/library?new=handout" className="btn">
              <Icon name="plus" /> 새 문서
            </Link>
            <Link to="/library" className="btn outline">
              내 보관함 보기 <Icon name="arrow" />
            </Link>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="small-art" />
          <div className="sheet-art">
            <em>THE PRIVATE LETTER</em>
            <strong>
              Moonlit
              <br />
              Invitation
            </strong>
            <span>
              Beyond the silent door
              <br />
              lies another story
            </span>
            <div className="seal">✦</div>
          </div>
        </div>
      </section>
      <RecentDocuments />
      <div className="bottom-banner">
        <div>
          <b>작업은 계정에 자동 저장되고, 어느 기기에서든 이어집니다.</b>
          <p>같은 Google 계정으로 로그인하면 PC와 모바일에서 같은 문서를 불러올 수 있어요.</p>
        </div>
        <Link to="/settings" className="btn small">
          계정 설정 <Icon name="arrow" />
        </Link>
      </div>
    </>
  )
}
