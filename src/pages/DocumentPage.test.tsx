import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentRecord } from '../lib/documents'
import type { PendingStore } from '../lib/pendingStore'
import { createFakeSupabase } from '../test/fakeSupabase'
import { createTestServices, renderApp } from '../test/renderApp'

afterEach(() => {
  vi.useRealTimers()
})

function setup(content = { text: '첫 줄' }) {
  const fake = createFakeSupabase()
  const row = fake.control.insertDocument({ title: '달빛 초대장', content })
  renderApp(`/documents/${row.id}`, { client: fake.client })
  return { ...fake, row }
}

const chip = () => document.querySelector('.editor-toolbar [data-status]')

describe('문서 페이지 (useDocument + 저장 상태 칩)', () => {
  it('서버 문서를 불러와 제목과 본문을 보여준다', async () => {
    setup()

    expect(await screen.findByDisplayValue('달빛 초대장')).toBeInTheDocument()
    expect(screen.getByLabelText('본문')).toHaveValue('첫 줄')
    expect(chip()).toHaveTextContent('저장됨')
    expect(chip()).toHaveClass('tag', 'good')
  })

  it('입력 → 저장 중 → (800ms 후) 저장됨, 서버에 반영 (StrictMode 에서도 한 번만 저장)', async () => {
    const { control, row } = setup()
    await screen.findByDisplayValue('달빛 초대장')

    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText('본문'), { target: { value: '첫 줄\n둘째 줄' } })
    expect(chip()).toHaveTextContent('저장 중')

    await act(() => vi.advanceTimersByTimeAsync(799))
    expect(control.calls.filter((c) => c.op === 'update')).toHaveLength(0)

    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(chip()).toHaveTextContent('저장됨')
    expect(control.calls.filter((c) => c.op === 'update')).toHaveLength(1)
    expect(control.tables.documents.find((d) => d.id === row.id)).toMatchObject({
      content: { text: '첫 줄\n둘째 줄' },
      version: 2,
    })
  })

  it('다른 기기가 먼저 저장했으면 충돌 칩과 선택지를 보여주고, 서버 버전을 불러올 수 있다', async () => {
    const { control, row } = setup()
    await screen.findByDisplayValue('달빛 초대장')
    control.serverEdit('documents', row.id, { title: '노트북에서 바꾼 제목' })

    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText('문서 제목'), { target: { value: '휴대폰 제목' } })
    await act(() => vi.advanceTimersByTimeAsync(800))

    expect(chip()).toHaveTextContent('충돌 발생')
    expect(screen.getByRole('alert')).toHaveTextContent('다른 기기에서 이 문서가 먼저 수정되었어요')
    expect(screen.getByRole('button', { name: '내 변경으로 덮어쓰기' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '서버 버전 불러오기' }))
    })
    expect(screen.getByLabelText('문서 제목')).toHaveValue('노트북에서 바꾼 제목')
    expect(chip()).toHaveTextContent('저장됨')
  })

  it('없는 문서는 404', async () => {
    const fake = createFakeSupabase()
    renderApp('/documents/nope', { client: fake.client })

    expect(await screen.findByRole('heading', { level: 1, name: '페이지를 찾을 수 없음' })).toBeInTheDocument()
  })
})

describe('동기화되지 않은 변경 (상단바 표시 · 오프라인 사본)', () => {
  it('닫힌 탭이 남긴 충돌 변경을 상단바에 표시하고, 문서를 열면 선택지를 보여 준다', async () => {
    const fake = createFakeSupabase()
    const row = fake.control.insertDocument({ title: '달빛 초대장', content: { text: '첫 줄' } })
    const services = createTestServices()
    await services.store.put({
      userId: 'user-1',
      docId: row.id,
      instanceId: 'closed-tab',
      draft: { title: '지난밤 오프라인 편집', content: { text: '첫 줄' } },
      baseVersion: 1,
      revision: 1,
      conflict: null,
      savedAt: Date.now(),
    })
    fake.control.serverEdit('documents', row.id, { title: '다른 기기 제목' }) // 서버 v2

    renderApp('/settings', { client: fake.client, services })

    const trigger = await screen.findByRole('button', { name: '동기화되지 않은 변경 1개' })
    fireEvent.click(trigger)
    const list = screen.getByRole('region', { name: '동기화되지 않은 변경 목록' })
    expect(list).toHaveTextContent('충돌 · 선택 필요')
    expect(fake.control.calls.filter((c) => c.op === 'update')).toHaveLength(0)

    fireEvent.click(within(list).getByRole('link', { name: /지난밤 오프라인 편집/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('다른 기기에서 이 문서가 먼저 수정되었어요')
    expect(screen.getByLabelText('문서 제목')).toHaveValue('지난밤 오프라인 편집')
    expect(chip()).toHaveTextContent('충돌 발생')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '내 변경으로 덮어쓰기' }))
    })
    expect(chip()).toHaveTextContent('저장됨')
    expect(fake.control.tables.documents.find((d) => d.id === row.id)).toMatchObject({
      title: '지난밤 오프라인 편집',
      version: 3,
    })
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: /동기화되지 않은 변경/ })).not.toBeInTheDocument())
  })

  it('회귀: 사본을 보다가 다시 연결하는 중(문서는 서버에서 삭제됨) 입력하면, 그 입력이 복구 화면에 보이고 이 기기에 남는다', async () => {
    const fake = createFakeSupabase()
    const row = fake.control.insertDocument({ title: '달빛 초대장', content: { text: '첫 줄' } })
    const services = createTestServices()
    await services.cache.put('user-1', row as unknown as DocumentRecord)
    // 편집기가 자기 대기 기록을 읽은 뒤, 그 결과만 늦게 돌려줄 수 있는 저장소
    const base = services.store
    let armed = false
    let release = () => {}
    let markReached = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const reached = new Promise<void>((resolve) => (markReached = resolve))
    const store: PendingStore = {
      ...base,
      async get(key) {
        const value = await base.get(key)
        if (armed && key.startsWith(`user-1/${row.id}/`)) {
          armed = false
          markReached()
          await gate
        }
        return value
      },
    }
    fake.control.offline = true
    renderApp(`/documents/${row.id}`, { client: fake.client, services: { ...services, store } })
    expect(await screen.findByText(/이 기기에 마지막으로 저장해 둔 사본/)).toBeInTheDocument()

    // 다시 연결됨 — 그 사이 다른 기기에서 문서를 삭제했다
    fake.control.offline = false
    fake.control.serverEdit('documents', row.id, { deleted_at: '2026-11-24T00:00:00.000Z' })
    fake.control.calls.length = 0
    armed = true
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await reached // 삭제됨을 확인하고 이 편집기의 기록을 읽었지만, 아직 적용하기 전 — 화면은 아직 편집 화면
    fireEvent.change(screen.getByLabelText('본문'), { target: { value: '다시 연결되는 순간의 입력' } })
    await act(async () => release())

    expect(await screen.findByText('서버에서 삭제된 문서입니다')).toBeInTheDocument()
    expect(screen.getByLabelText('본문')).toHaveValue('다시 연결되는 순간의 입력')
    expect(screen.getByLabelText('본문')).toHaveAttribute('readonly')
    expect(screen.getByText(/서버에 반영되지 않은 변경이에요/)).toBeInTheDocument()
    await waitFor(async () =>
      expect(await base.list('user-1')).toMatchObject([
        { conflict: 'deleted', draft: { title: '달빛 초대장', content: { text: '다시 연결되는 순간의 입력' } } },
      ]),
    )
    expect(fake.control.calls.filter((c) => c.op === 'update')).toHaveLength(0)
  })

  it('서버에 연결되지 않으면 이 기기에 저장해 둔 사본을 오프라인 상태로 연다', async () => {
    const fake = createFakeSupabase()
    const row = fake.control.insertDocument({ title: '달빛 초대장', content: { text: '첫 줄' } })
    const services = createTestServices()
    await services.cache.put('user-1', row as unknown as DocumentRecord)
    fake.control.offline = true

    renderApp(`/documents/${row.id}`, { client: fake.client, services })

    expect(await screen.findByDisplayValue('달빛 초대장')).toBeInTheDocument()
    expect(screen.getByLabelText('본문')).toHaveValue('첫 줄')
    expect(chip()).toHaveTextContent('오프라인')
    expect(screen.getByText(/이 기기에 마지막으로 저장해 둔 사본/)).toBeInTheDocument()
  })
})

describe('서버에서 삭제된 문서의 대기 변경 (복구 화면)', () => {
  const draft = { title: '세 번째 밤 (오프라인)', content: { text: '서버에 없는 문장' } }

  /** 닫힌 탭이 남긴 대기 편집이 있는데, 그 문서가 다른 기기에서 삭제된 상태 */
  async function setupDeleted(path: (docId: string) => string) {
    const fake = createFakeSupabase()
    const row = fake.control.insertDocument({ type: 'log', title: '세 번째 밤', content: { text: '서버 본문' } })
    const services = createTestServices()
    await services.store.put({
      userId: 'user-1',
      docId: row.id,
      instanceId: 'closed-tab',
      draft,
      baseVersion: 1,
      revision: 3,
      docType: 'log',
      conflict: null,
      savedAt: Date.now(),
    })
    fake.control.serverEdit('documents', row.id, { deleted_at: '2026-11-24T00:00:00.000Z' })
    renderApp(path(row.id), { client: fake.client, services })
    return { ...fake, row, services }
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('상단바 목록은 바로 버리지 않고 복구 화면으로 연결한다 — 제목과 본문을 보고 복사할 수 있다', async () => {
    const { services } = await setupDeleted(() => '/settings')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    fireEvent.click(await screen.findByRole('button', { name: '동기화되지 않은 변경 1개' }))
    const list = screen.getByRole('region', { name: '동기화되지 않은 변경 목록' })
    await waitFor(() => expect(list).toHaveTextContent('서버에서 삭제됨'))
    expect(within(list).queryByRole('button', { name: /버리기/ })).not.toBeInTheDocument()

    fireEvent.click(within(list).getByRole('link', { name: '열어서 복구' }))
    expect(await screen.findByText('서버에서 삭제된 문서입니다')).toBeInTheDocument()
    expect(screen.getByLabelText('문서 제목')).toHaveValue(draft.title)
    expect(screen.getByLabelText('본문')).toHaveValue('서버에 없는 문장')
    expect(screen.getByLabelText('본문')).toHaveAttribute('readonly')
    expect(screen.getByText(/서버에 반영되지 않은 변경이에요/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '내용 복사' }))
    expect(await screen.findByText('제목과 본문을 클립보드에 복사했어요.')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith('세 번째 밤 (오프라인)\n\n서버에 없는 문장')
    expect(await services.store.list('user-1')).toMatchObject([{ conflict: 'deleted', draft }])
  })

  it('클립보드를 쓸 수 없으면 직접 복사하라고 알린다 (내용은 그대로)', async () => {
    await setupDeleted((id) => `/documents/${id}`)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })

    fireEvent.click(await screen.findByRole('button', { name: '내용 복사' }))
    expect(await screen.findByText(/복사하지 못했어요/)).toBeInTheDocument()
    expect(screen.getByLabelText('본문')).toHaveValue('서버에 없는 문장')
  })

  it('새 문서로 복구: 실패하면 기록이 남고, 성공하면 새 문서로 이동한 뒤에야 기록을 지운다', async () => {
    const { control, row, services } = await setupDeleted((id) => `/documents/${id}`)
    expect(await screen.findByText('서버에서 삭제된 문서입니다')).toBeInTheDocument()

    control.failNext = { message: 'server unavailable', code: '503', details: '', hint: '' }
    fireEvent.click(screen.getByRole('button', { name: '새 문서로 복구' }))
    expect(await screen.findByText(/새 문서로 복구하지 못했어요: server unavailable/)).toBeInTheDocument()
    expect(await services.store.list('user-1')).toMatchObject([{ conflict: 'deleted', draft }])
    expect(control.tables.documents).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '새 문서로 복구' }))
    await waitFor(() => expect(screen.getByTestId('location').textContent).not.toBe(`/documents/${row.id}`))
    const created = control.tables.documents.find((d) => d.id !== row.id)
    expect(created).toMatchObject({ type: 'log', title: draft.title, content: draft.content, deleted_at: null })
    expect(screen.getByTestId('location').textContent).toBe(`/documents/${created?.id}`)

    // 새 문서는 일반 편집 화면으로 열린다
    expect(await screen.findByDisplayValue(draft.title)).toBeInTheDocument()
    expect(screen.getByLabelText('본문')).toHaveValue('서버에 없는 문장')
    expect(screen.getByLabelText('본문')).not.toHaveAttribute('readonly')
    expect(await services.store.list('user-1')).toEqual([])
    await waitFor(() => expect(screen.queryByRole('button', { name: /동기화되지 않은 변경/ })).not.toBeInTheDocument())
  })

  it('변경 버리기는 확인 창을 거쳐야 한다 — 취소하면 그대로, 확인하면 지우고 404', async () => {
    const { services } = await setupDeleted((id) => `/documents/${id}`)
    expect(await screen.findByText('서버에서 삭제된 문서입니다')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '변경 버리기' }))
    const dialog = screen.getByRole('dialog', { name: '변경을 버릴까요?' })
    expect(dialog).toHaveTextContent('되돌릴 수 없어요')
    expect(await services.store.list('user-1')).toHaveLength(1)
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await services.store.list('user-1')).toHaveLength(1)
    expect(screen.getByText('서버에서 삭제된 문서입니다')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '변경 버리기' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '변경을 버릴까요?' })).getByRole('button', { name: '버리기' }))
    expect(await screen.findByRole('heading', { level: 1, name: '페이지를 찾을 수 없음' })).toBeInTheDocument()
    expect(await services.store.list('user-1')).toEqual([])
    await waitFor(() => expect(screen.queryByRole('button', { name: /동기화되지 않은 변경/ })).not.toBeInTheDocument())
  })
})
