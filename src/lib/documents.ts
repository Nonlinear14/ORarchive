import type { DocumentType, Json, Tables, Visibility } from './database.types'
import type { FolioClient } from './supabase'

export type DocumentRecord = Tables<'documents'>
export type DocumentContent = DocumentRecord['content']

/** 목록 화면용 요약 (본문 content 는 가져오지 않는다) */
export type DocumentSummary = Pick<
  DocumentRecord,
  'id' | 'type' | 'title' | 'visibility' | 'version' | 'project_id' | 'created_at' | 'updated_at'
> & {
  /** 로그의 룰 이름 (로그가 아니거나 없으면 null) */
  rule?: string | null
}

/** 자동 저장으로 보내는 편집 가능 필드 */
export interface DocumentDraft {
  title: string
  content: DocumentContent
}

export type UpdateResult =
  | { kind: 'ok'; doc: DocumentRecord }
  /** 기대한 version 의 행이 없음 — 다른 기기에서 먼저 저장했거나 삭제됨. server 는 현재 서버 상태(없으면 null). */
  | { kind: 'conflict'; server: DocumentRecord | null }

export interface DocumentRepository {
  list(): Promise<DocumentSummary[]>
  get(id: string): Promise<DocumentRecord | null>
  create(input: { type: DocumentType; title?: string; content?: DocumentContent }): Promise<DocumentRecord>
  update(id: string, draft: DocumentDraft, expectedVersion: number): Promise<UpdateResult>
  softDelete(id: string): Promise<void>
  /** 이 종류 문서를 한 번이라도 만든 적이 있는가 (지운 문서 포함). 기본 핸드아웃을 한 번만 넣는 데 쓴다 */
  hasEver?(type: DocumentType): Promise<boolean>
}

export const documentTypeLabels: Record<DocumentType, string> = {
  handout: '핸드아웃',
  log: '세션 로그',
  character: '캐릭터 시트',
}

export const visibilityLabels: Record<Visibility, string> = {
  private: '비공개',
  link: '링크 공유',
  public: '전체 공개',
}

export const documentTypes: DocumentType[] = ['handout', 'log', 'character']

export function defaultTitle(type: DocumentType): string {
  return `제목 없는 ${documentTypeLabels[type]}`
}

/** 문서를 여는 화면 경로: 핸드아웃은 핸드아웃 편집, 로그는 Roll20 로그 편집, 나머지는 (각 화면이 생기기 전까지) 기본 편집기 */
export function documentPath(type: DocumentType, id: string): string {
  if (type === 'handout') return `/studio/handout/${id}`
  if (type === 'log') return `/studio/log/roll20/${id}`
  return `/documents/${id}`
}

/** content.text 를 문자열로 읽는다 (Phase 1 의 단순 본문) */
export function contentText(content: DocumentContent): string {
  const text: Json | undefined = content.text
  return typeof text === 'string' ? text : ''
}

/** 서버/PostgREST 오류를 사용자에게 보여줄 수 있는 Error 로 감싼다 */
export class RepositoryError extends Error {
  readonly code: string | undefined

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'RepositoryError'
    this.code = code
  }
}

function fail(error: { message: string; code?: string }): never {
  throw new RepositoryError(error.message, error.code)
}

/** 목록용 칸. 로그는 본문 전체 대신 룰 이름(content->>rule)만 가져온다 */
const SUMMARY_COLUMNS = 'id, type, title, visibility, version, project_id, created_at, updated_at, rule:content->>rule'

/**
 * documents 테이블 접근. 소유자 필터는 RLS 가 보장하지만, 쿼리에도 명시해 인덱스를 타게 한다.
 * ownerId 를 받지 않는 이유: owner_id 컬럼 기본값이 auth.uid() 이고 RLS 가 본인 행만 돌려준다.
 */
export function createDocumentRepository(client: FolioClient): DocumentRepository {
  const table = () => client.from('documents')

  async function get(id: string): Promise<DocumentRecord | null> {
    const { data, error } = await table().select('*').eq('id', id).is('deleted_at', null).maybeSingle()
    if (error) fail(error)
    return data
  }

  return {
    async list() {
      const { data, error } = await table()
        .select(SUMMARY_COLUMNS)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
      if (error) fail(error)
      return data ?? []
    },

    get,

    async create({ type, title, content }) {
      const { data, error } = await table()
        .insert({ type, title: title ?? defaultTitle(type), content: content ?? {} })
        .select('*')
        .single()
      if (error) fail(error)
      return data
    },

    async update(id, draft, expectedVersion) {
      const { data, error } = await table()
        .update({ title: draft.title, content: draft.content })
        .eq('id', id)
        .eq('version', expectedVersion)
        .is('deleted_at', null)
        .select('*')
        .maybeSingle()
      if (error) fail(error)
      if (data) return { kind: 'ok', doc: data }

      // 0행 갱신 → 충돌. 현재 서버 상태를 함께 돌려줘 사용자가 고를 수 있게 한다.
      const server = await get(id)
      return { kind: 'conflict', server }
    },

    async softDelete(id) {
      const { error } = await table().update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) fail(error)
    },

    async hasEver(type) {
      // deleted_at 조건 없음: 지운 문서도 센다 (RLS 의 select 정책은 본인 행이면 지운 것도 돌려준다)
      const { data, error } = await table().select('id').eq('type', type).limit(1)
      if (error) fail(error)
      return (data ?? []).length > 0
    },
  }
}
