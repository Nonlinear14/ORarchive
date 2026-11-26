import { Link } from 'react-router'
import { Icon } from '../components/Icon'
import { PageHeading } from '../components/PageHeading'
import { ComingSoon } from './ComingSoon'

export function NotFoundPage() {
  return (
    <>
      <PageHeading
        title="페이지를 찾을 수 없음"
        eyebrow="404 / NOT FOUND"
        description="주소가 바뀌었거나 아직 만들어지지 않은 페이지예요."
        action={
          <Link to="/" className="btn primary">
            홈으로 <Icon name="arrow" />
          </Link>
        }
      />
      <ComingSoon message="요청한 페이지가 서재에 없습니다." />
    </>
  )
}
