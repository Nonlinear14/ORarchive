import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createFakeSupabase } from '../../../test/fakeSupabase'
import { renderApp } from '../../../test/renderApp'
import { resolveLog, serializeLog } from './model'
import { parseRoll20Log } from './parse'

/** 실제 Roll20 채팅 아카이브와 같은 구조 (대사는 지어낸 내용) */
const SAMPLE = `<html><head><title>Chat Log for 안개 낀 도서관</title><style>.sheet-rolltemplate-coc-1 caption{background:black}</style></head><body>
<div id="textchat" class="textchatcontainer"><div class="content">
<div class="message desc" data-messageid="-d1"><div class="spacer"></div> 1923년 가을, 아컴.</div>
<div class="message general" data-messageid="-g1"><div class="spacer"></div><div class="avatar"><img src="https://files.d20.io/a.png"></div><span class="tstamp">t</span><span class="by">엘리너:</span>서가 번호가 이상해요.</div>
<div class="message general" data-messageid="-g2">누가 빼 간 것 같아요.</div>
<div class="message private whisper" data-messageid="-w1"><div class="spacer"></div><div class="avatar"><img src="./x_files/b.png"></div><span class="tstamp">t</span><span class="by">(From 토마스):</span> 발자국 크기 기억나세요?</div>
<div class="message general" data-messageid="-r1"><div class="spacer"></div><div class="avatar"><img src="./x_files/b.png"></div><span class="tstamp">t</span><span class="by">토마스:</span><div class="sheet-rolltemplate-coc-1"><table><caption>관찰력</caption><tr><td>23</td></tr></table></div></div>
</div></div></body></html>`

const originalMatchMedia = window.matchMedia
afterEach(() => {
  window.matchMedia = originalMatchMedia
})

function stubMobile() {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('750'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

function seedLog() {
  const fake = createFakeSupabase()
  const row = fake.control.insertDocument({ type: 'log', title: '안개 낀 도서관', content: serializeLog(parseRoll20Log(SAMPLE).content) })
  const saved = () => resolveLog(fake.control.tables.documents.find((d) => d.id === row.id)!.content as never)
  return { ...fake, row, saved }
}

/** 그림자 DOM 안의 로그 미리보기 */
async function stage() {
  const host = await screen.findByTestId('log-stage')
  await waitFor(() => expect(host.shadowRoot?.querySelector('.log-msg')).toBeTruthy())
  return host.shadowRoot as unknown as HTMLElement
}

const row = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`.log-msg[data-mid="${id}"]`)!

describe('Roll20 로그 편집 — 목록과 불러오기', () => {
  it('HTML 파일을 올리면 읽은 결과를 보여 주고, 불러오면 로그 문서를 만들어 편집 화면을 연다', async () => {
    const fake = createFakeSupabase()
    renderApp('/studio/log/roll20', { client: fake.client })
    expect(await screen.findByRole('heading', { level: 1, name: 'Roll20 로그 편집' })).toBeInTheDocument()
    expect(await screen.findByText('아직 불러온 로그가 없어요.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /새 로그 불러오기/ }))
    const dialog = screen.getByRole('dialog', { name: 'Roll20 로그 불러오기' })
    const file = new File([SAMPLE], 'Chat Log for 안개 낀 도서관.html', { type: 'text/html' })
    fireEvent.change(within(dialog).getByLabelText('채팅 로그 HTML 파일'), { target: { files: [file] } })

    const summary = await within(dialog).findByText(/메시지 5개 · 화자 2명 · 귓속말 1개/)
    expect(summary).toHaveTextContent('시트 판정 디자인 찾음')
    expect(within(dialog).getByText(/아바타 1개가 PC 폴더 경로예요/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('로그 이름')).toHaveValue('안개 낀 도서관')

    expect(within(dialog).getByLabelText('룰')).toHaveValue('크툴루의 부름')
    fireEvent.change(within(dialog).getByLabelText('룰'), { target: { value: '크툴루의 부름 7판' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '불러오기' }))
    await stage()
    const doc = fake.control.tables.documents[0]
    expect(doc).toMatchObject({ type: 'log', title: '안개 낀 도서관' })
    expect(screen.getByTestId('location').textContent).toBe(`/studio/log/roll20/${doc.id}`)
    expect(resolveLog(doc.content as never).messages).toHaveLength(5)
    expect(resolveLog(doc.content as never).rule).toBe('크툴루의 부름 7판')
  })

  it('채팅 아카이브를 복사해 붙여 넣어도 읽는다 · 채팅이 아니면 알려 준다', async () => {
    renderApp('/studio/log/roll20', { client: createFakeSupabase().client })
    fireEvent.click(await screen.findByRole('button', { name: /새 로그 불러오기/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('tab', { name: /붙여넣기/ }))
    const zone = within(dialog).getByLabelText('채팅 로그 붙여넣기')

    fireEvent.paste(zone, { clipboardData: { getData: (type: string) => (type === 'text/plain' ? '그냥 글' : '') } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('채팅 내용을 찾지 못했어요')

    fireEvent.paste(zone, { clipboardData: { getData: (type: string) => (type === 'text/html' ? SAMPLE : '') } })
    expect(await within(dialog).findByText(/메시지 5개/)).toBeInTheDocument()
    expect(within(dialog).getByText('붙여 넣은 로그')).toBeInTheDocument()
  })
})

describe('Roll20 로그 편집 — 편집 화면', () => {
  it('메시지를 클릭해 고치고 적용하면 저장되고, 되돌리기로 돌아간다', async () => {
    const { client, row: doc, saved } = seedLog()
    renderApp(`/studio/log/roll20/${doc.id}`, { client })
    const root = await stage()
    expect(root.querySelector('style')?.textContent).toContain('.sheet-rolltemplate-coc-1 caption')

    fireEvent.click(row(root, '-g1').querySelector('.message')!)
    const textarea = within(root).getByLabelText('메시지 내용')
    expect(textarea).toHaveValue('서가 번호가 이상해요.')
    fireEvent.change(textarea, { target: { value: '서가 번호가 **이상해요**.' } })
    fireEvent.click(within(root).getByRole('button', { name: '적용' }))
    expect(row(root, '-g1').innerHTML).toContain('<strong>이상해요</strong>')
    await waitFor(() => expect(saved().messages[1].text).toBe('서가 번호가 **이상해요**.'), { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await waitFor(() => expect(saved().messages[1].text).toBe('서가 번호가 이상해요.'), { timeout: 3000 })
    fireEvent.click(screen.getByRole('button', { name: '다시하기' }))
    await waitFor(() => expect(saved().messages[1].text).toBe('서가 번호가 **이상해요**.'), { timeout: 3000 })
  })

  it('마우스를 올리면 편집 버튼: 판정 메시지는 수정이 꺼져 있고, 복제·이동·삭제는 된다', async () => {
    const { client, row: doc, saved } = seedLog()
    renderApp(`/studio/log/roll20/${doc.id}`, { client })
    const root = await stage()

    fireEvent.mouseEnter(row(root, '-r1'))
    const toolbar = within(row(root, '-r1')).getByRole('toolbar', { name: '메시지 편집' })
    expect(within(toolbar).getByRole('button', { name: /수정/ })).toBeDisabled()
    expect(within(toolbar).getByRole('button', { name: '아래로' })).toBeDisabled()
    fireEvent.click(within(toolbar).getByRole('button', { name: '위로' }))
    await waitFor(() => expect(saved().messages.map((m) => m.id)).toEqual(['-d1', '-g1', '-g2', '-r1', '-w1']), { timeout: 3000 })

    fireEvent.mouseEnter(row(root, '-g2'))
    fireEvent.click(within(row(root, '-g2')).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(saved().messages.map((m) => m.id)).not.toContain('-g2'), { timeout: 3000 })
    expect(await screen.findByText(/되돌리기로 다시 살릴 수 있어요/)).toBeInTheDocument()

    fireEvent.mouseEnter(row(root, '-g1'))
    fireEvent.click(within(row(root, '-g1')).getByRole('button', { name: '아래에 새 메시지' }))
    const textarea = within(root).getByLabelText('메시지 내용')
    expect(textarea).toHaveValue('')
    fireEvent.change(textarea, { target: { value: '새 대사' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(saved().messages[2]).toMatchObject({ speaker: '엘리너', text: '새 대사' }), { timeout: 3000 })
  })

  it('로그 편집 패널: 전체 다듬기 · 캐릭터 색 · 숨기기 토글 · 아바타 주소 · 찾아 바꾸기', async () => {
    const { client, row: doc, saved } = seedLog()
    renderApp(`/studio/log/roll20/${doc.id}`, { client })
    const root = await stage()
    const panel = screen.getByRole('complementary', { name: '로그 편집' })
    // 이름 바꾸기 칸·메시지 수·시간 표시·내 메시지 배경은 없다
    expect(within(panel).queryByLabelText('엘리너 표시 이름')).not.toBeInTheDocument()
    expect(within(panel).queryByText(/메시지 \d+개/)).not.toBeInTheDocument()
    expect(within(panel).queryByRole('switch', { name: /시간 표시/ })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('radiogroup', { name: '내 메시지 배경' })).not.toBeInTheDocument()

    expect(row(root, '-w1')).toBeTruthy()
    fireEvent.click(within(panel).getByRole('switch', { name: /귓속말 숨기기/ }))
    await waitFor(() => expect(row(root, '-w1')).toBeNull())
    fireEvent.click(within(panel).getByRole('switch', { name: /구분선 표시/ }))
    fireEvent.click(within(panel).getByRole('radio', { name: '원형' }))
    await waitFor(() => expect(saved().options).toMatchObject({ hideWhispers: true, divider: false, avatarShape: 'circle' }), { timeout: 3000 })

    // 색 동그라미: 고르면 반영, 다시 열어 기본 색으로
    fireEvent.click(within(panel).getByRole('button', { name: /엘리너 배경 색/ }))
    const picker = within(panel).getByLabelText('엘리너 배경 색 고르기') as HTMLInputElement
    picker.value = '#ffeeaa'
    picker.dispatchEvent(new Event('change'))
    await waitFor(() => expect(row(root, '-g1').querySelector<HTMLElement>('.message')!.style.backgroundColor).toBe('rgb(255, 238, 170)'))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(within(panel).getByRole('button', { name: /엘리너 대사 색/ }))
    const textPicker = within(panel).getByLabelText('엘리너 대사 색 고르기') as HTMLInputElement
    textPicker.value = '#225588'
    textPicker.dispatchEvent(new Event('change'))
    await waitFor(() => expect(saved().characters['엘리너']).toEqual({ bg: '#ffeeaa', text: '#225588' }), { timeout: 3000 })
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(within(panel).getByRole('button', { name: /엘리너 배경 색/ }))
    fireEvent.click(within(panel).getByRole('button', { name: '기본 색으로' }))
    await waitFor(() => expect(saved().characters['엘리너']).toEqual({ text: '#225588' }), { timeout: 3000 })

    // 숨기기 토글
    fireEvent.click(within(panel).getByRole('switch', { name: '토마스 메시지 숨기기' }))
    await waitFor(() => expect(row(root, '-r1')).toBeNull())

    // 깨진 아바타 → 링크 주소로 바꾸기
    expect(within(panel).getByText(/아바타가 PC 폴더 경로라/)).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: '토마스 아바타 바꾸기' }))
    const dialog = screen.getByRole('dialog', { name: '토마스 아바타' })
    fireEvent.change(within(dialog).getByLabelText('아바타 이미지 주소'), { target: { value: 'javascript:alert(1)' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '적용' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('https://')
    fireEvent.change(within(dialog).getByLabelText('아바타 이미지 주소'), { target: { value: 'https://i.imgur.com/t.png' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '적용' }))
    await waitFor(() => expect(saved().characters['토마스']).toMatchObject({ avatar: 'https://i.imgur.com/t.png', hidden: true }), { timeout: 3000 })
    expect(within(panel).queryByText(/아바타가 PC 폴더 경로라/)).not.toBeInTheDocument()

    fireEvent.change(within(panel).getByLabelText('찾을 글자'), { target: { value: '서가' } })
    expect(within(panel).getByText('1곳 찾음')).toBeInTheDocument()
    fireEvent.change(within(panel).getByLabelText('바꿀 글자'), { target: { value: '책장' } })
    fireEvent.click(within(panel).getByRole('button', { name: '모두 바꾸기' }))
    await waitFor(() => expect(saved().messages[1].text).toBe('책장 번호가 이상해요.'), { timeout: 3000 })
  })

  it('룰: 감지한 룰을 머리에 보여 주고, 바꿀 수 있고, 목록의 룰 칸에 나온다 · 안내와 내보내기는 미리보기 위아래', async () => {
    const { client, row: doc, saved } = seedLog()
    renderApp(`/studio/log/roll20/${doc.id}`, { client })
    await stage()
    const rule = screen.getByLabelText('룰')
    expect(rule).toHaveValue('크툴루의 부름')
    fireEvent.change(rule, { target: { value: '크툴루의 부름 7판' } })
    fireEvent.blur(rule)
    await waitFor(() => expect(saved().rule).toBe('크툴루의 부름 7판'), { timeout: 3000 })

    const preview = screen.getByRole('region', { name: '로그 미리보기' })
    expect(within(preview).getByText(/원본 파일은 서버에 올리지 않아요/)).toBeInTheDocument()
    const exportBar = within(preview).getByRole('group', { name: '내보내기' })
    expect(within(exportBar).getByRole('button', { name: /HTML 파일 저장/ })).toBeInTheDocument()
    expect(within(exportBar).getByRole('button', { name: /블로그용 코드 복사/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '로그 목록' }))
    const table = await screen.findByRole('table', { name: '문서 목록' })
    expect(within(table).getByRole('columnheader', { name: '룰' })).toBeInTheDocument()
    expect(table).toHaveTextContent('크툴루의 부름 7판')
  })

  it('휴대폰: 메시지를 누르면 아래에서 메뉴가 열린다', async () => {
    stubMobile()
    const { client, row: doc, saved } = seedLog()
    renderApp(`/studio/log/roll20/${doc.id}`, { client })
    const root = await stage()

    fireEvent.click(row(root, '-g2').querySelector('.message')!)
    const sheet = screen.getByRole('dialog', { name: '메시지 편집 메뉴' })
    expect(within(sheet).getByRole('button', { name: /수정/ })).toBeEnabled()
    fireEvent.click(within(sheet).getByRole('button', { name: /복제/ }))
    await waitFor(() => expect(saved().messages).toHaveLength(6), { timeout: 3000 })
    expect(screen.queryByRole('dialog', { name: '메시지 편집 메뉴' })).not.toBeInTheDocument()
  })

  it('Roll20 형식이 아닌 로그는 기본 편집기로 안내하고, /documents 로 연 Roll20 로그는 로그 편집으로 넘긴다', async () => {
    const fake = createFakeSupabase()
    const plain = fake.control.insertDocument({ type: 'log', title: '1단계 로그', content: { text: '예전 로그' } })
    renderApp(`/studio/log/roll20/${plain.id}`, { client: fake.client })
    expect(await screen.findByRole('link', { name: /기본 편집기에서 열기/ })).toHaveAttribute('href', `/documents/${plain.id}`)

    const { client, row: doc } = seedLog()
    renderApp(`/documents/${doc.id}`, { client })
    await waitFor(() => expect(screen.getAllByTestId('location').at(-1)?.textContent).toBe(`/studio/log/roll20/${doc.id}`))
  })
})
