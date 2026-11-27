import { useEffect, useRef } from 'react'
import { useRepository } from '../../lib/useRepository'
import { sampleHandoutDocument } from './templates/sample'

/** 이 탭에서 이미 확인한 저장소 (같은 화면을 다시 열어도 한 번만 묻는다) */
const checked = new WeakSet<object>()

/**
 * 기본 핸드아웃 "핸드아웃 샘플"을 새 계정의 템플릿 아카이브에 한 번 넣는다.
 * - 목록이 비어 있을 때만 확인하고, 핸드아웃을 한 번도 만든 적 없는 계정(지운 것 포함)에만 만든다.
 *   그래서 사용자가 샘플을 지우면 다시 생기지 않고, 다른 기기에서도 다시 생기지 않는다.
 * - 실패해도 조용히 넘어간다 (빈 아카이브는 그대로 쓸 수 있다). 만들면 onSeeded 로 목록을 다시 불러온다.
 */
export function useSeedSampleHandout(ready: boolean, handoutCount: number, onSeeded: () => void) {
  const repo = useRepository()
  const onSeededRef = useRef(onSeeded)
  useEffect(() => {
    onSeededRef.current = onSeeded
  })

  useEffect(() => {
    if (!ready || handoutCount > 0 || !repo.hasEver || checked.has(repo)) return
    checked.add(repo)
    const run = async () => {
      try {
        if (await repo.hasEver!('handout')) return
        await repo.create({ type: 'handout', ...sampleHandoutDocument() })
        onSeededRef.current() // (StrictMode 의 두 번째 실행은 건너뛰므로 언마운트 여부로 막지 않는다)
      } catch {
        checked.delete(repo) // 다음에 다시 시도
      }
    }
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    // 같은 기기의 여러 탭이 동시에 만들지 않게 잠근다
    void (locks ? locks.request('folio-seed-sample-handout', run) : run())
  }, [ready, handoutCount, repo])
}
