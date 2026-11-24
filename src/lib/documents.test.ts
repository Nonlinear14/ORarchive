import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from '../test/fakeSupabase'
import { RepositoryError, contentText, createDocumentRepository, defaultTitle, type DocumentRepository } from './documents'

let fake: FakeSupabase
let repo: DocumentRepository

beforeEach(() => {
  fake = createFakeSupabase()
  repo = createDocumentRepository(fake.client)
})

describe('documents 저장소', () => {
  it('create 는 유형별 기본 제목과 빈 content, version 1 로 만든다', async () => {
    const doc = await repo.create({ type: 'log' })

    expect(doc).toMatchObject({ type: 'log', title: defaultTitle('log'), content: {}, version: 1, owner_id: 'user-1' })
    expect(defaultTitle('log')).toBe('제목 없는 세션 로그')
  })

  it('list 는 삭제되지 않은 내 문서를 최근 수정순으로, 본문 없이 돌려준다', async () => {
    const a = await repo.create({ type: 'handout', title: 'A' })
    const b = await repo.create({ type: 'character', title: 'B' })
    await repo.create({ type: 'log', title: 'C' })
    await repo.softDelete(b.id)
    await repo.update(a.id, { title: 'A2', content: {} }, 1)

    const list = await repo.list()
    expect(list.map((d) => d.title)).toEqual(['A2', 'C'])
    expect(list[0]).not.toHaveProperty('content')
    const listCall = fake.control.calls.find((c) => c.op === 'select')
    expect(listCall?.filters).toContainEqual(['is', 'deleted_at', null])
  })

  it('update 는 기대 version 이 맞으면 저장하고 서버가 올린 version 을 돌려준다', async () => {
    const doc = await repo.create({ type: 'handout' })

    const result = await repo.update(doc.id, { title: '편지', content: { text: '안녕' } }, 1)

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.doc.version).toBe(2)
    expect(contentText(result.doc.content)).toBe('안녕')
    const call = fake.control.calls.findLast((c) => c.op === 'update')
    expect(call?.filters).toContainEqual(['eq', 'version', 1])
  })

  it('다른 기기가 먼저 저장해 version 이 다르면 0행 → conflict 와 서버 상태를 돌려준다', async () => {
    const doc = await repo.create({ type: 'handout', title: '원본' })
    fake.control.serverEdit('documents', doc.id, { title: '다른 기기' }) // version 2

    const result = await repo.update(doc.id, { title: '내 기기', content: {} }, 1)

    expect(result.kind).toBe('conflict')
    if (result.kind !== 'conflict') return
    expect(result.server).toMatchObject({ title: '다른 기기', version: 2 })
    // 서버 내용은 덮어쓰지 않았다
    expect(fake.control.tables.documents[0].title).toBe('다른 기기')
  })

  it('문서가 다른 기기에서 삭제됐으면 conflict.server 는 null', async () => {
    const doc = await repo.create({ type: 'handout' })
    await repo.softDelete(doc.id)

    const result = await repo.update(doc.id, { title: 'x', content: {} }, 2)

    expect(result).toEqual({ kind: 'conflict', server: null })
  })

  it('get 은 없거나 삭제된 문서에 null', async () => {
    const doc = await repo.create({ type: 'handout' })
    expect(await repo.get('nope')).toBeNull()
    await repo.softDelete(doc.id)
    expect(await repo.get(doc.id)).toBeNull()
  })

  it('서버 오류는 RepositoryError 로 던진다', async () => {
    fake.control.failNext = { message: 'permission denied', code: '42501', details: '', hint: '' }

    await expect(repo.list()).rejects.toMatchObject(new RepositoryError('permission denied', '42501'))
  })
})
