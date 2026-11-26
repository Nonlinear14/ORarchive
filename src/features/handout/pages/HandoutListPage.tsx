import { Link } from 'react-router'
import { DocumentList } from '../../../components/DocumentList'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeading } from '../../../components/PageHeading'
import { useMyDocuments } from '../../../lib/useMyDocuments'

/** /studio/handout — 내 핸드아웃 목록. 새 핸드아웃은 템플릿 갤러리에서 시작한다 */
export default function HandoutListPage() {
  const { status, docs, error, reload } = useMyDocuments()
  const handouts = docs.filter((doc) => doc.type === 'handout')

  return (
    <>
      <PageHeading
        title="핸드아웃 스튜디오"
        eyebrow="STUDIO / HANDOUT DESIGNER"
        description="캔버스의 글자를 직접 클릭해 수정하고, 완성된 디자인을 Roll20 핸드아웃에 바로 붙여넣어 보세요."
        action={
          <Link to="/templates" className="btn primary">
            <Icon name="plus" /> 새 핸드아웃
          </Link>
        }
      />
      <div className="section-top">
        <div>
          <h2>내 핸드아웃</h2>
          <p>{status === 'ready' ? `핸드아웃 ${handouts.length}개 · 열면 스튜디오에서 이어서 편집해요` : ' '}</p>
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
        (handouts.length > 0 ? (
          <DocumentList docs={handouts} />
        ) : (
          <div className="library-list empty">
            아직 만든 핸드아웃이 없어요.
            <br />
            <Link to="/templates" className="text-link">
              템플릿 갤러리에서 시작하기 <Icon name="arrow" />
            </Link>
          </div>
        ))}
    </>
  )
}
