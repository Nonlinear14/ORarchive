/**
 * 탭 사이 배타 잠금. 대기 중인 편집 기록 하나를 동시에 두 곳(열린 편집기, 백그라운드 동기화)이
 * 보내지 않게 한다.
 *
 * - 브라우저: Web Locks API(navigator.locks) — 같은 출처의 모든 탭이 공유하고, 탭이 닫히면 자동으로 풀린다.
 * - 지원하지 않는 환경(테스트, 아주 오래된 브라우저): 같은 페이지 안에서만 유효한 메모리 구현.
 *   이때는 다른 탭과 조율하지 못하지만, 서버의 version 검사 덕분에 중복 전송이 덮어쓰기로 이어지지는 않는다.
 */
export interface Locks {
  /** 잠금을 얻을 때까지 기다린 뒤 fn 을 실행하고, fn 이 끝나면 푼다 */
  request<T>(name: string, fn: () => Promise<T>): Promise<T>
  /** 지금 바로 얻을 수 있을 때만 fn 을 실행한다. 다른 곳이 쥐고 있으면 fn 을 실행하지 않고 acquired: false */
  tryRequest<T>(name: string, fn: () => Promise<T>): Promise<{ acquired: true; value: T } | { acquired: false }>
  /** 지금 누군가 쥐고 있는 잠금 이름들 */
  held(): Promise<Set<string>>
}

/** 잠금을 얻을 때까지 기다린 뒤, 돌려받은 함수를 부를 때까지 계속 쥐고 있는다 */
export function holdLock(locks: Locks, name: string): Promise<() => void> {
  return new Promise((resolveAcquired, rejectAcquired) => {
    locks
      .request(
        name,
        () =>
          new Promise<void>((release) => {
            resolveAcquired(() => release())
          }),
      )
      .catch(rejectAcquired)
  })
}

export function createWebLocks(manager: LockManager): Locks {
  return {
    request: (name, fn) => manager.request(name, () => fn()),
    async tryRequest<T>(name: string, fn: () => Promise<T>) {
      return manager.request(name, { ifAvailable: true }, async (lock) =>
        lock ? { acquired: true as const, value: await fn() } : { acquired: false as const },
      )
    },
    async held() {
      const state = await manager.query()
      return new Set((state.held ?? []).flatMap((lock) => (lock.name ? [lock.name] : [])))
    },
  }
}

export function createMemoryLocks(): Locks {
  const holders = new Set<string>()
  const waiters = new Map<string, (() => void)[]>()

  async function acquire(name: string) {
    while (holders.has(name)) {
      await new Promise<void>((resolve) => {
        const queue = waiters.get(name) ?? []
        queue.push(resolve)
        waiters.set(name, queue)
      })
    }
    holders.add(name)
  }

  function release(name: string) {
    holders.delete(name)
    const queue = waiters.get(name)
    const next = queue?.shift()
    if (queue && queue.length === 0) waiters.delete(name)
    next?.()
  }

  async function run<T>(name: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } finally {
      release(name)
    }
  }

  return {
    async request(name, fn) {
      await acquire(name)
      return run(name, fn)
    },
    async tryRequest<T>(name: string, fn: () => Promise<T>) {
      if (holders.has(name)) return { acquired: false as const }
      holders.add(name)
      return { acquired: true as const, value: await run(name, fn) }
    },
    async held() {
      return new Set(holders)
    },
  }
}

let defaultLocks: Locks | null = null

/** 앱 전역 기본 잠금 */
export function getLocks(): Locks {
  defaultLocks ??=
    typeof navigator !== 'undefined' && navigator.locks ? createWebLocks(navigator.locks) : createMemoryLocks()
  return defaultLocks
}
