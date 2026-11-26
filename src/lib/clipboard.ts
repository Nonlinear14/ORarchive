/**
 * 서식 있는 복사 (text/html + text/plain). 목업 v3 에서 브라우저로 검증한 순서를 그대로 옮겼다.
 *
 * 1. navigator.clipboard.write + ClipboardItem 이 있으면 그것으로 쓴다.
 * 2. API 가 없거나 동기적으로 예외를 던지면, 같은 클릭(사용자 활성화) 안에서 곧바로
 *    copy 이벤트 + document.execCommand('copy') 로 대신 쓴다. ← 반드시 동기적으로 실행되어야 한다.
 * 3. 비동기 쓰기가 거부되면(권한·포커스) 마지막으로 한 번 더 execCommand 로 시도한다.
 *    (이때는 활성화가 끝났을 수 있어 실패할 수 있다)
 * 4. 모두 실패하면 reject 한다 — 호출한 쪽이 사용자에게 알린다.
 *
 * 클릭 핸들러에서 await 없이 바로 불러야 한다 (2번이 활성화 안에서 돌도록).
 */

export class ClipboardError extends Error {
  constructor(message = '클립보드에 복사하지 못했어요.') {
    super(message)
    this.name = 'ClipboardError'
  }
}

type Payload = Partial<Record<'text/html' | 'text/plain', string>>

/** copy 이벤트를 가로채 원하는 형식을 싣고 execCommand('copy') 를 실행한다. 성공 여부를 동기적으로 돌려준다 */
function legacyCopy(payload: Payload): boolean {
  if (typeof document === 'undefined') return false
  let wrote = false
  const onCopy = (event: Event) => {
    const data = (event as ClipboardEvent).clipboardData
    if (!data) return
    event.preventDefault()
    for (const [type, value] of Object.entries(payload)) data.setData(type, value)
    wrote = true
  }
  document.addEventListener('copy', onCopy, true)
  try {
    return document.execCommand('copy') === true && wrote
  } catch {
    return false
  } finally {
    document.removeEventListener('copy', onCopy, true)
  }
}

const settle = (ok: boolean) => (ok ? Promise.resolve() : Promise.reject(new ClipboardError()))

function asyncWrite(payload: Payload): Promise<void> | null {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  const Item = typeof window === 'undefined' ? undefined : window.ClipboardItem
  if (!clipboard || typeof clipboard.write !== 'function' || typeof Item !== 'function') return null
  const parts: Record<string, Blob> = {}
  for (const [type, value] of Object.entries(payload)) parts[type] = new Blob([value], { type })
  const result: unknown = clipboard.write([new Item(parts)])
  return result instanceof Promise || (typeof result === 'object' && result !== null && 'then' in result)
    ? (result as Promise<void>)
    : null
}

function copyPayload(payload: Payload): Promise<void> {
  let pending: Promise<void> | null
  try {
    pending = asyncWrite(payload)
  } catch {
    pending = null
  }
  // API 가 없거나 동기적으로 실패: 지금(클릭의 사용자 활성화 안에서) 바로 대체 방법을 쓴다
  if (!pending) return settle(legacyCopy(payload))
  // 비동기 쓰기가 거부됨: 마지막 시도
  return Promise.resolve(pending).then(
    () => undefined,
    () => settle(legacyCopy(payload)),
  )
}

/** text/html + text/plain 을 함께 복사한다 (Roll20 · 문서 편집기에 서식째 붙여 넣기) */
export function copyRich(html: string, text: string): Promise<void> {
  return copyPayload({ 'text/html': html, 'text/plain': text })
}

/** 평문만 복사한다 (HTML 코드 복사 등) */
export function copyText(text: string): Promise<void> {
  return copyPayload({ 'text/plain': text })
}
