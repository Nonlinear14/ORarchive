import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createFakeSupabase } from '../../../test/fakeSupabase'
import { renderApp } from '../../../test/renderApp'
import { resolveCcfLog, serializeCcfLog } from './model'
import { parseCcfoliaLog } from './parse'

/** 코코포리아 "로그 출력" HTML 과 같은 구조 (대사는 지어낸 내용) */
const p = (color: string, tab: string, name: string, body: string) =>
  `<p style="color:${color};"><span> [${tab}]</span><span>${name}</span> : <span>${body}</span></p>`

const SAMPLE = `<!DOCTYPE html><html><head><title>ccfolia - logs</title></head><body>
${p('#607d8b', 'main', 'GM', '안개가 짙은 밤입니다.')}
${p('#FFA500', 'main', '하늘', '누구 있어요?')}
${p('#FFA500', 'main', '하늘', 'CC&lt;=60  [ 관찰력 ] (1D100&lt;=60) 보너스, 페널티 주사위[0] ＞ 28 ＞ 28 ＞ 어려운 성공')}
${p('#888888', 'main', 'system', '[ 하늘 ] 이성 : 60 → 57')}
${p('#d3004d', 'other', '유진', '잡담입니다.')}
</body></html>`

const originalMatchMedia = window.matchMedia
afterEach(() => {
  window.matchMedia = originalMatchMedia
})

function seedLog() {
  const fake = createFakeSupabase()
  const parsed = parseCcfoliaLog(SAMPLE).content
  const row = fake.control.insertDocument({ type: 'log', title: '안개 낀 밤', content: serializeCcfLog(parsed) })
  const saved = () => resolveCcfLog(fake.control.tables.documents.find((d) => d.id === row.id)!.content as never)
  return { ...fake, row, saved, ids: parsed.messages.map((m) => m.id) }
}

async function stage() {
  const host = await screen.findByTestId('log-stage')
  await waitFor(() => expect(host.shadowRoot?.querySelector('.log-msg')).toBeTruthy())
  return host.shadowRoot as unknown as HTMLElement
}
const row = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`.log-msg[data-mid="${id}"]`)!

describe('코코포리아 로그 편집', () => {
  it('메뉴는 불러오기 창을 띄우고(HTML 파일만), 불러오면 코코포리아 로그 편집이 열린다', async () => {
    const fake = createFakeSupabase()
    renderApp('/studio/log/ccfolia', { client: fake.client })
    expect(await screen.findByRole('heading', { level: 1, name: '코코포리아 로그 편집' })).toBeInTheDocument()
    const dialog = await screen.findByRole('dialog', { name: '코코포리아 로그 불러오기' })
    expect(within(dialog).queryByRole('tab', { name: /붙여넣기/ })).not.toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('코코포리아 로그 HTML 파일'), { target: { files: [new File(['<p>아님</p>'], 'x.html', { type: 'text/html' })] } })
    expect(await within(dialog).findByText(/코코포리아 로그 형식이 아니에요/)).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('코코포리아 로그 HTML 파일'), { target: { files: [new File([SAMPLE], '안개 낀 밤.html', { type: 'text/html' })] } })
    expect(await within(dialog).findByText(/메시지 5개 · 캐릭터 3명 · 탭 2개 · 주사위 1개 · system 1개/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('로그 이름')).toHaveValue('안개 낀 밤')
    fireEvent.click(within(dialog).getByRole('button', { name: '불러오기' }))
    await stage()
    expect(screen.getByTestId('location').textContent).toMatch(/^\/studio\/log\/ccfolia\//)
    expect(fake.control.tables.documents[0]).toMatchObject({ type: 'log', title: '안개 낀 밤' })
  })

  it('대사를 클릭해 고치고 되돌린다 · 판정 · system 은 고칠 수 없고 옮길 수 있다', async () => {
    const { client, row: doc, saved, ids } = seedLog()
    renderApp(`/studio/log/ccfolia/${doc.id}`, { client })
    const root = await stage()

    fireEvent.click(row(root, ids[1]).querySelector('.ccf-msg')!)
    const box = within(root).getByRole('textbox', { name: '메시지 내용' })
    box.innerHTML = '누구<br>있어요?'
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(saved().messages[1].text).toBe('누구\n있어요?'), { timeout: 3000 })
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await waitFor(() => expect(saved().messages[1].text).toBe('누구 있어요?'), { timeout: 3000 })

    fireEvent.mouseEnter(row(root, ids[2]))
    const toolbar = within(row(root, ids[2])).getByRole('toolbar', { name: '메시지 편집' })
    expect(within(toolbar).getByRole('button', { name: '수정' })).toBeDisabled()
    fireEvent.click(within(toolbar).getByRole('button', { name: '위로' }))
    await waitFor(() => expect(saved().messages.map((m) => m.id)).toEqual([ids[0], ids[2], ids[1], ids[3], ids[4]]), { timeout: 3000 })
  })

  it('패널: 서술자 · 탭 끄기 · 전체 다듬기 · 찾아 바꾸기 (GM 은 처음부터 서술자가 아니다)', async () => {
    const { client, row: doc, saved, ids } = seedLog()
    renderApp(`/studio/log/ccfolia/${doc.id}`, { client })
    const root = await stage()
    const panel = screen.getByRole('complementary', { name: '로그 편집' })

    const gm = within(panel).getByRole('button', { name: 'GM', pressed: false })
    fireEvent.click(gm)
    await waitFor(() => expect(saved().narrators).toEqual(['GM']), { timeout: 3000 })
    expect(row(root, ids[0]).querySelector('.ccf-narr')).toBeTruthy()

    fireEvent.click(within(panel).getByRole('switch', { name: 'other 탭 보이기' }))
    await waitFor(() => expect(saved().tabs.other).toEqual({ hidden: true }), { timeout: 3000 })
    expect(row(root, ids[4])).toBeNull()

    fireEvent.click(within(panel).getByRole('switch', { name: /주사위 결과 숨기기/ }))
    await waitFor(() => expect(row(root, ids[2])).toBeNull())

    fireEvent.change(within(panel).getByLabelText('찾을 글자'), { target: { value: '안개' } })
    fireEvent.change(within(panel).getByLabelText('바꿀 글자'), { target: { value: '비' } })
    expect(within(panel).getByText('1곳 찾음')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: '모두 바꾸기' }))
    await waitFor(() => expect(saved().messages[0].text).toBe('비가 짙은 밤입니다.'), { timeout: 3000 })
  })

  it('다른 주소로 열어도 코코포리아 로그 편집으로 간다 (/documents · Roll20 로그 주소)', async () => {
    const { client, row: doc } = seedLog()
    renderApp(`/documents/${doc.id}`, { client })
    await waitFor(() => expect(screen.getAllByTestId('location').at(-1)?.textContent).toBe(`/studio/log/ccfolia/${doc.id}`))
  })

  it('Roll20 로그 주소로 열면 코코포리아 로그 편집으로 넘긴다', async () => {
    const { client, row: doc } = seedLog()
    renderApp(`/studio/log/roll20/${doc.id}`, { client })
    await waitFor(() => expect(screen.getAllByTestId('location').at(-1)?.textContent).toBe(`/studio/log/ccfolia/${doc.id}`))
    await stage()
  })
})
