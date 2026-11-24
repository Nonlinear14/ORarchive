import { Icon } from './Icon'
import { PageHeading } from './PageHeading'

/** Supabase 환경 변수가 없을 때 로그인이 필요한 화면 대신 보여준다 */
export function ConfigMissing() {
  return (
    <>
      <PageHeading title="서버 연결 설정 필요" eyebrow="CONFIGURATION" />
      <div className="callout danger" role="alert">
        <Icon name="alert" />
        <span>
          서버 연결 설정(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)이 없어 로그인과 동기화를 사용할 수 없어요.
          <br />
          배포 환경 변수 또는 로컬 <code>.env</code> 파일을 확인해 주세요.
        </span>
      </div>
    </>
  )
}
