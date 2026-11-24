import { Icon } from '../components/Icon'
import './ComingSoon.css'

export function ComingSoon({ message = '이 화면은 준비 중입니다. 곧 만나요.' }: { message?: string }) {
  return (
    <section className="coming-soon">
      <div className="coming-soon-mark" aria-hidden="true">
        ✦
      </div>
      <strong>준비 중</strong>
      <p>{message}</p>
      <span className="tag gold">
        <Icon name="lock" /> 다음 단계에서 공개
      </span>
    </section>
  )
}
