import { describe, expect, it } from 'vitest'
import { insertCcfMessageAfter, replaceAllCcf, setCcfMessageSpeaker, setNarrator, setTab, countCcfMatches } from './edits'
import { ccfBlogCode, ccfHtmlFile } from './export'
import { resolveCcfLog, serializeCcfLog, type CcfoliaLogContent } from './model'
import { renderCcfMessagesHtml, visibleCcfMessages } from './render'
import { documentPath } from '../../../lib/documents'

/** 지어낸 대사로 만든 코코포리아 로그 */
function sample(patch: Partial<CcfoliaLogContent> = {}): CcfoliaLogContent {
  return resolveCcfLog(
    serializeCcfLog({
      format: 'ccfolia-log',
      v: 1,
      messages: [
        { id: 'a', tab: 'main', speaker: 'GM', color: '#607d8b', text: '안개가 짙은 밤입니다.' },
        { id: 'b', tab: 'main', speaker: '하늘', color: '#ffa500', text: '누구 있어요?' },
        { id: 'c', tab: 'main', speaker: '하늘', color: '#ffa500', text: '<b>대답</b>이 없네' },
        { id: 'd', tab: 'main', speaker: '하늘', color: '#ffa500', text: 'CC<=60  [ 관찰력 ] (1D100<=60) 보너스, 페널티 주사위[0] ＞ 28 ＞ 28 ＞ 어려운 성공' },
        { id: 'e', tab: 'main', speaker: 'system', color: '#888888', text: '[ 하늘 ] 이성 : 60 → 57' },
        { id: 'f', tab: 'other', speaker: '유진', color: '#d3004d', text: '[펌블표](2) ＞ 도구를 하나 잃는다.' },
        { id: 'g', tab: 'other', speaker: '유진', text: '   ' },
      ],
      characters: {},
      tabs: {},
      narrators: [],
      options: { hideEmpty: true, hideRolls: false, collapseNames: true, divider: true, showTabs: false, avatarShape: 'square' },
      ...patch,
    }),
  )
}

const doc = (html: string) => {
  const holder = document.createElement('div')
  holder.innerHTML = html
  return holder
}

describe('코코포리아 로그 그리기', () => {
  it('대사 · 수치 카드(S-3) · 판정 카드(D-3) · 표 카드(T-2), 글은 이스케이프', () => {
    const html = renderCcfMessagesHtml(sample())
    const root = doc(html)
    expect(root.querySelectorAll('.ccf-msg')).toHaveLength(6) // 빈 메시지는 숨김
    expect(html).toContain('&lt;b&gt;대답&lt;/b&gt;이 없네')
    expect(root.querySelector('.ccf-sys')?.textContent).toBe('하늘 · 이성60 → 57−3')
    const dice = root.querySelector('.ccf-dice')!
    expect(dice.querySelector('.ccf-dice-t')?.textContent).toBe('관찰력')
    expect(dice.querySelector('.ccf-dice-v')?.textContent).toBe('28')
    expect(dice.querySelector('.ccf-dice-w')?.getAttribute('style')).toContain('#2e7d32')
    expect(root.querySelector('.ccf-table-h')?.textContent).toBe('2펌블표')
    expect(root.querySelector('.ccf-table-b')?.textContent).toBe('도구를 하나 잃는다.')
  })

  it('연속 이름 정리: 같은 사람이 이어 말하면 이름은 한 번만 (끄면 매번)', () => {
    const on = doc(renderCcfMessagesHtml(sample()))
    expect([...on.querySelectorAll('.ccf-name, .ccf-name-line')].map((n) => n.textContent)).toEqual(['GM', '하늘', '유진'])
    const off = doc(renderCcfMessagesHtml(sample({ options: { ...sample().options, collapseNames: false } })))
    expect(off.querySelectorAll('.ccf-name, .ccf-name-line')).toHaveLength(5)
  })

  it('서술자: 이름 없이 가운데 · 굵게', () => {
    const root = doc(renderCcfMessagesHtml(sample({ narrators: ['GM'] })))
    const first = root.querySelector('.ccf-msg')!
    expect(first.classList).toContain('ccf-narr')
    expect(first.querySelector('.ccf-name')).toBeNull()
    expect(first.textContent).toBe('안개가 짙은 밤입니다.')
  })

  it('탭: 끈 탭은 보이지 않고, 탭 색이 캐릭터 색보다 우선 · 탭 이름은 나오지 않는다', () => {
    const content = sample({
      tabs: { other: { hidden: true }, main: { bg: '#101010', text: '#fafafa' } },
      characters: { 하늘: { color: '#ff0000', text: '#00ff00', bg: '#0000ff' } },
    })
    const rows = visibleCcfMessages(content)
    expect(rows.map((r) => r.message.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    const html = renderCcfMessagesHtml(content)
    const root = doc(html)
    const haneul = root.querySelectorAll('.ccf-msg')[1] as HTMLElement
    expect(haneul.style.background).toBe('rgb(16, 16, 16)')
    expect(haneul.style.color).toBe('rgb(250, 250, 250)')
    expect(html).not.toContain('main')
  })

  it('탭 이름 표시: 켜면 이름 앞에 (이름 없는 줄은 탭 이름만 한 줄), 이어진 메시지에는 없다', () => {
    const base = sample({ narrators: ['GM'], options: { ...sample().options, showTabs: true } })
    // 같은 서술자가 같은 탭에서 이어 말하면 첫 줄만
    const twice = { ...base, messages: [base.messages[0], { ...base.messages[0], id: 'a2' }, ...base.messages.slice(1)] }
    const runs = [...doc(renderCcfMessagesHtml(twice)).querySelectorAll('.ccf-msg')]
    expect(runs[0].querySelector('.ccf-tab')).toBeTruthy()
    expect(runs[1].querySelector('.ccf-tab')).toBeNull()
    const root = doc(renderCcfMessagesHtml(base))
    const msgs = [...root.querySelectorAll('.ccf-msg')]
    expect(msgs[0].querySelector('.ccf-tab-line')?.textContent).toBe('main') // 서술
    expect(msgs[1].querySelector('.ccf-tab')?.textContent).toBe('main') // 서술 뒤 하늘
    expect(msgs[1].querySelector('.ccf-tab + .ccf-name')).toBeTruthy()
    expect(msgs[2].querySelector('.ccf-tab')).toBeNull() // 연속 이름 정리
    expect(msgs[4].querySelector('.ccf-tab-line')?.textContent).toBe('main') // system
    expect(msgs[5].querySelector('.ccf-name-line .ccf-tab')?.textContent).toBe('other') // 표 카드 이름 줄
  })

  it('캐릭터 설정 · 원래 색 · 숨기기 · 주사위 결과 숨기기', () => {
    const content = sample({ characters: { 하늘: { text: '#123456' }, GM: { hidden: true } }, options: { ...sample().options, hideRolls: true } })
    const rows = visibleCcfMessages(content)
    expect(rows.map((r) => r.message.id)).toEqual(['b', 'c', 'e'])
    const root = doc(renderCcfMessagesHtml(content))
    const name = root.querySelector('.ccf-name') as HTMLElement
    expect(name.style.color).toBe('rgb(255, 165, 0)') // 이름은 원래 색
    expect((root.querySelector('.ccf-msg') as HTMLElement).style.color).toBe('rgb(18, 52, 86)')
  })

  it('내보내기: HTML 파일과 블로그용 코드(class 없이 style 로)', () => {
    const content = sample()
    const file = ccfHtmlFile(content, '<세션>')
    expect(file).toContain('<title>&lt;세션&gt;</title>')
    expect(file).toContain('.ccf-dice{')
    const blog = ccfBlogCode(content)
    expect(blog).not.toContain('class=')
    expect(blog).toContain('font-weight')
  })
})

describe('코코포리아 로그 편집 연산', () => {
  const stored = () => serializeCcfLog(sample())

  it('탭 설정 · 서술자', () => {
    let s = setTab('main', 'bg', '#eeeeee')(stored())
    s = setTab('other', 'hidden', true)(s)
    expect(resolveCcfLog(s).tabs).toEqual({ main: { bg: '#eeeeee' }, other: { hidden: true } })
    s = setTab('other', 'hidden', false)(s)
    expect(resolveCcfLog(s).tabs.other).toEqual({})
    s = setNarrator('GM', true)(s)
    expect(setNarrator('GM', true)(s)).toBe(s)
    expect(resolveCcfLog(setNarrator('GM', false)(s)).narrators).toEqual([])
  })

  it('아래에 새 메시지: 같은 탭 · 화자 · 원래 색의 빈 대사', () => {
    const s = resolveCcfLog(insertCcfMessageAfter('f', 'new')(stored()))
    expect(s.messages[6]).toEqual({ id: 'new', tab: 'other', speaker: '유진', color: '#d3004d', text: '' })
  })

  it('화자 바꾸기: 원래 색은 그 캐릭터의 다른 메시지에서 (없으면 뺀다)', () => {
    const s = resolveCcfLog(setCcfMessageSpeaker('b', 'GM')(stored()))
    expect(s.messages[1]).toMatchObject({ speaker: 'GM', color: '#607d8b' })
    const t = resolveCcfLog(setCcfMessageSpeaker('b', '새 사람')(stored()))
    expect(t.messages[1].color).toBeUndefined()
  })

  it('찾아 바꾸기는 대사만 (판정 · system · 표 결과는 그대로)', () => {
    const content = sample()
    expect(countCcfMatches(content.messages, '하늘')).toBe(0)
    expect(countCcfMatches(content.messages, '누구')).toBe(1)
    const s = resolveCcfLog(replaceAllCcf('하늘', '바다')(stored()))
    expect(s.messages[4].text).toBe('[ 하늘 ] 이성 : 60 → 57')
  })

  it('문서 경로: 코코포리아 로그는 코코포리아 로그 편집으로', () => {
    expect(documentPath('log', 'x', 'ccfolia-log')).toBe('/studio/log/ccfolia/x')
    expect(documentPath('log', 'x', 'roll20-log')).toBe('/studio/log/roll20/x')
    expect(documentPath('log', 'x')).toBe('/studio/log/roll20/x')
  })
})
