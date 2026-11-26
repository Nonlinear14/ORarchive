/**
 * 테스트용 가짜 Supabase 클라이언트.
 * 앱이 쓰는 부분(auth 일부, from().select/insert/update/eq/is/order/single/maybeSingle, rpc)만
 * 메모리 테이블 위에서 흉내 낸다. RLS 처럼 현재 사용자의 행만 보이고, documents UPDATE 는 version 을 올린다.
 */
import type { Session, User } from '@supabase/supabase-js'
import type { FolioClient } from '../lib/supabase'

type Row = Record<string, unknown>
type PgError = { message: string; code: string; details: string; hint: string }
type Result = { data: unknown; error: PgError | null }

export interface FakeSupabaseOptions {
  user?: User | null
  /** getSession() 응답을 지연시킨다 (로딩 상태 테스트용) */
  sessionDelayMs?: number
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    aud: 'authenticated',
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: '달빛 기록자', avatar_url: null },
    email: 'reader@example.com',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as User
}

function makeSession(user: User): Session {
  return {
    access_token: 'access',
    refresh_token: 'refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  }
}

const pgError = (message: string, code = ''): PgError => ({ message, code, details: '', hint: '' })

export function createFakeSupabase(options: FakeSupabaseOptions = {}) {
  let currentUser: User | null = options.user === undefined ? makeUser() : options.user
  const tables: Record<string, Row[]> = { profiles: [], projects: [], documents: [] }
  const authListeners = new Set<(event: string, session: Session | null) => void>()
  let idSeq = 0
  // 인스턴스마다 다른 id — 앱 전역 PendingStore(메모리) 기록이 테스트 사이에 섞이지 않게
  const idPrefix = Math.random().toString(36).slice(2, 8)
  let clock = Date.parse('2026-11-24T09:00:00.000Z')
  const now = () => new Date((clock += 1000)).toISOString()

  const control = {
    /** true 면 모든 DB 요청이 fetch 실패처럼 돌아온다 */
    offline: false,
    /** 다음 DB 요청 하나를 이 오류로 실패시킨다 */
    failNext: null as PgError | null,
    /** 실행된 DB 요청 기록 */
    calls: [] as { table: string; op: string; filters: [string, string, unknown][] }[],
    signInWithOAuth: { error: null as { message: string } | null, calls: [] as unknown[] },
    rpcCalls: [] as string[],
    tables,
    setUser(user: User | null) {
      currentUser = user
      const session = user ? makeSession(user) : null
      authListeners.forEach((listener) => listener(user ? 'SIGNED_IN' : 'SIGNED_OUT', session))
    },
    /** 다른 기기에서 저장한 것처럼 서버 행을 직접 바꾼다 (version 증가) */
    serverEdit(table: string, id: string, patch: Row) {
      const row = tables[table].find((r) => r.id === id)
      if (!row) throw new Error(`no row ${id}`)
      Object.assign(row, patch, { updated_at: now() })
      if (table === 'documents') row.version = (row.version as number) + 1
    },
    insertDocument(row: Row): Row & { id: string } {
      const full = {
        id: `doc-${idPrefix}-${++idSeq}`,
        owner_id: currentUser?.id,
        project_id: null,
        type: 'handout',
        title: '',
        content: {},
        visibility: 'private',
        version: 1,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
        ...row,
      }
      tables.documents.push(full)
      return full
    },
  }

  function visible(table: string): Row[] {
    const uid = currentUser?.id
    if (!uid) return []
    const ownerKey = table === 'profiles' ? 'id' : 'owner_id'
    return tables[table].filter((row) => row[ownerKey] === uid)
  }

  function pick(row: Row, columns: string): Row {
    if (columns.trim() === '*') return { ...row }
    const out: Row = {}
    columns.split(',').forEach((c) => {
      const key = c.trim()
      // PostgREST 의 'alias:column->>field' (JSON 값 하나를 글자로)
      const json = /^(\w+):(\w+)->>(\w+)$/.exec(key)
      if (json) {
        const value = (row[json[2]] as Row | undefined)?.[json[3]]
        out[json[1]] = value === undefined || value === null ? null : String(value)
        return
      }
      out[key] = row[key]
    })
    return out
  }

  function from(table: string) {
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: Row = {}
    let columns = '*'
    let returning = false
    let mode: 'many' | 'single' | 'maybe' = 'many'
    const filters: [string, string, unknown][] = []
    let order: { column: string; ascending: boolean } | null = null

    const execute = (): Result => {
      control.calls.push({ table, op, filters: [...filters] })
      if (control.offline) return { data: null, error: pgError('TypeError: Failed to fetch') }
      if (control.failNext) {
        const error = control.failNext
        control.failNext = null
        return { data: null, error }
      }
      const matches = (row: Row) =>
        filters.every(([kind, col, val]) => (kind === 'is' ? (row[col] ?? null) === val : row[col] === val))

      let rows: Row[]
      if (op === 'insert') {
        if (!currentUser) return { data: null, error: pgError('new row violates row-level security policy', '42501') }
        const base: Row =
          table === 'documents'
            ? {
                id: `doc-${idPrefix}-${++idSeq}`,
                owner_id: currentUser.id,
                project_id: null,
                title: '',
                content: {},
                visibility: 'private',
                version: 1,
                deleted_at: null,
              }
            : { id: `row-${++idSeq}` }
        const row = { ...base, created_at: now(), updated_at: now(), ...payload }
        tables[table].push(row)
        rows = [row]
      } else if (op === 'update') {
        rows = visible(table).filter(matches)
        rows.forEach((row) => {
          Object.assign(row, payload, { updated_at: now() })
          if (table === 'documents') row.version = (row.version as number) + 1
        })
      } else {
        rows = visible(table).filter(matches)
        if (order) {
          const { column, ascending } = order
          rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1))
        }
      }

      if (op !== 'select' && !returning) return { data: null, error: null }
      const data = rows.map((row) => pick(row, columns))
      if (mode === 'single') {
        return data.length === 1
          ? { data: data[0], error: null }
          : { data: null, error: pgError('JSON object requested, multiple (or no) rows returned', 'PGRST116') }
      }
      if (mode === 'maybe') {
        return data.length <= 1
          ? { data: data[0] ?? null, error: null }
          : { data: null, error: pgError('multiple rows', 'PGRST116') }
      }
      return { data, error: null }
    }

    const builder = {
      select(cols = '*') {
        columns = cols
        if (op !== 'select') returning = true
        return builder
      },
      insert(row: Row) {
        op = 'insert'
        payload = row
        return builder
      },
      update(patch: Row) {
        op = 'update'
        payload = patch
        return builder
      },
      eq(column: string, value: unknown) {
        filters.push(['eq', column, value])
        return builder
      },
      is(column: string, value: unknown) {
        filters.push(['is', column, value])
        return builder
      },
      order(column: string, opts: { ascending?: boolean } = {}) {
        order = { column, ascending: opts.ascending ?? true }
        return builder
      },
      single() {
        mode = 'single'
        return builder
      },
      maybeSingle() {
        mode = 'maybe'
        return builder
      },
      then<T>(resolve: (value: Result) => T, reject?: (reason: unknown) => T) {
        return Promise.resolve().then(execute).then(resolve, reject)
      },
    }
    return builder
  }

  const auth = {
    async getSession() {
      if (options.sessionDelayMs) await new Promise((r) => setTimeout(r, options.sessionDelayMs))
      return { data: { session: currentUser ? makeSession(currentUser) : null }, error: null }
    },
    onAuthStateChange(callback: (event: string, session: Session | null) => void) {
      authListeners.add(callback)
      return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } }
    },
    async signInWithOAuth(args: unknown) {
      control.signInWithOAuth.calls.push(args)
      return { data: { provider: 'google', url: 'https://accounts.google.com/' }, error: control.signInWithOAuth.error }
    },
    async signOut() {
      control.setUser(null)
      return { error: null }
    },
  }

  async function rpc(name: string) {
    control.rpcCalls.push(name)
    if (name === 'delete_my_account' && currentUser) {
      const uid = currentUser.id
      tables.documents = tables.documents.filter((r) => r.owner_id !== uid)
      tables.profiles = tables.profiles.filter((r) => r.id !== uid)
    }
    return { data: null, error: null }
  }

  const client = { auth, from, rpc } as unknown as FolioClient
  return { client, control }
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>
