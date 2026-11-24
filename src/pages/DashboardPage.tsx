import { Link } from 'react-router'
import { Icon } from '../components/Icon'
import { PageHeading } from '../components/PageHeading'
import './DashboardPage.css'

export function DashboardPage() {
  return (
    <>
      <PageHeading title="대시보드" description="모든 이야기와 창작물을 한 곳에서 관리하세요." />
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
            <Link to="/studio/handout" className="btn">
              <Icon name="plus" /> 새 핸드아웃
            </Link>
            <Link to="/projects" className="btn outline">
              내 프로젝트 보기 <Icon name="arrow" />
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
      <div className="bottom-banner">
        <div>
          <b>작업은 계정에 보관되고, 어느 기기에서든 이어집니다.</b>
          <p>Google 로그인과 클라우드 동기화는 다음 단계에서 연결됩니다.</p>
        </div>
        <Link to="/settings" className="btn small">
          계정 설정 <Icon name="arrow" />
        </Link>
      </div>
    </>
  )
}
