import { describe, expect, it } from 'vitest'
import { classifyMessage, tierOf } from './classify'
import { resolveCcfLog, serializeCcfLog, tabsOf, ccfSpeakersOf } from './model'
import { CcfoliaParseError, parseCcfoliaLog } from './parse'

/** 코코포리아 "로그 출력" HTML 과 같은 구조 (대사는 지어낸 내용) */
const p = (color: string, tab: string, name: string, body: string) => `
<p style="color:${color};">
  <span> [${tab}]</span>
  <span>${name}</span> :
  <span>
    ${body}
  </span>
</p>`

const SAMPLE = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8" /><title>ccfolia - logs</title></head><body>
${p('#607d8b', 'main', 'GM', '안개가 짙은 밤입니다.<br>&quot;누구 있나요?&quot;')}
${p('#FFA500', 'main', '하늘', 'CC&lt;=60  [ 도서관 이용 ] (1D100&lt;=60) 보너스, 페널티 주사위[0] ＞ 28 ＞ 28 ＞ 어려운 성공')}
${p('#888888', 'main', 'system', '[ 하늘 ] 이성 : 60 → 57')}
${p('#d3004d', 'other', '유진', '[펌블표](2) ＞ 도구를 하나 잃는다.')}
${p('#;', 'other', '', '   ')}
${p('#d3004d', 'main', '유진', 'choice(왼쪽, 오른쪽) (choice(왼쪽,오른쪽)) ＞ 왼쪽')}
</body></html>`

describe('코코포리아 로그 읽기', () => {
  it('메시지마다 탭 · 이름 · 색 · 글을 읽는다 (줄바꿈 · 따옴표 되살림, 들여쓰기 제거)', () => {
    const { content, stats, title } = parseCcfoliaLog(SAMPLE, '세션 1화.html')
    expect(title).toBe('세션 1화')
    expect(content.messages).toHaveLength(6)
    expect(content.messages[0]).toMatchObject({ tab: 'main', speaker: 'GM', color: '#607d8b', text: '안개가 짙은 밤입니다.\n"누구 있나요?"' })
    expect(content.messages[1]).toMatchObject({ speaker: '하늘', color: '#ffa500' })
    // 잘못된 색(#;)은 버리고, 이름 없는 빈 메시지도 그대로 둔다
    expect(content.messages[4]).toEqual({ id: 'c4', tab: 'other', speaker: '', text: '' })
    expect(stats).toEqual({ messages: 6, speakers: 3, tabs: 2, rolls: 3, system: 1 })
    expect(tabsOf(content)).toEqual([
      { tab: 'main', count: 4 },
      { tab: 'other', count: 2 },
    ])
    expect(ccfSpeakersOf(content).map((s) => s.speaker)).toEqual(['유진', 'GM', '하늘'])
  })

  it('메시지 안의 HTML 은 글자로만 읽는다 (태그 · 스크립트를 살리지 않는다)', () => {
    const { content } = parseCcfoliaLog(`<body>${p('#000000', 'main', 'A', '&lt;b&gt;굵게&lt;/b&gt;<script>alert(1)</script>')}</body>`)
    expect(content.messages[0].text).toBe('<b>굵게</b>alert(1)')
  })

  it('코코포리아 로그가 아니면 알려 준다', () => {
    expect(() => parseCcfoliaLog('<html><body><p>그냥 글</p></body></html>')).toThrow(CcfoliaParseError)
  })

  it('저장 → 다시 읽기: 값이 그대로', () => {
    const { content } = parseCcfoliaLog(SAMPLE)
    const again = resolveCcfLog(serializeCcfLog(content))
    expect(again.messages).toEqual(content.messages)
    expect(again.options).toEqual(content.options)
    expect(again.narrators).toEqual([])
  })
})

describe('메시지 종류 알아보기', () => {
  const c = (speaker: string, text: string) => classifyMessage({ speaker, text })

  it('system: [ 이름 ] 항목 : 전 → 후', () => {
    expect(c('system', '[ 하늘 ] 이성 : 60 → 57')).toEqual({ kind: 'system', who: '하늘', label: '이성', from: '60', to: '57' })
    expect(c('system', '하늘 님이 들어왔습니다')).toEqual({ kind: 'system' })
  })

  it('크툴루 판정: 기술 · 식 · 결과 값 · 단계 (보너스 주사위 표시)', () => {
    expect(c('하늘', 'CC<=60  [ 도서관 이용 ] (1D100<=60) 보너스, 페널티 주사위[0] ＞ 28 ＞ 28 ＞ 어려운 성공')).toEqual({
      kind: 'dice',
      title: '도서관 이용',
      sub: '1D100 ≤ 60',
      value: '28',
      tier: 'success',
      word: '어려운 성공',
    })
    expect(c('하늘', 'CC(1)<=60  [ 관찰력 ] (1D100<=60) 보너스, 페널티 주사위[1] ＞ 27, 67 ＞ 27 ＞ 극단적 성공')).toMatchObject({
      title: '관찰력',
      sub: '1D100 ≤ 60 · 보너스 주사위 1 (27, 67)',
      value: '27',
      tier: 'crit',
    })
    expect(c('하늘', 'CC<=40  [ 운전 ] (1D100<=40) 보너스, 페널티 주사위[-1] ＞ 99, 9 ＞ 99 ＞ 대실패')).toMatchObject({
      sub: '1D100 ≤ 40 · 페널티 주사위 1 (99, 9)',
      tier: 'fumble',
    })
  })

  it('다른 룰 · 일반 굴림 · choice', () => {
    expect(c('유진', '2D6>=5 | 【잠입술】 (2D6>=5) ＞ 8[3,5] ＞ 8 ＞ 성공')).toMatchObject({ title: '잠입술', value: '8', tier: 'success' })
    expect(c('유진', '1D4 이성 손실 (1D4) ＞ 3')).toEqual({ kind: 'dice', title: '이성 손실', sub: '1D4', value: '3' })
    expect(c('유진', 'choice(왼쪽, 오른쪽) (choice(왼쪽,오른쪽)) ＞ 왼쪽')).toEqual({ kind: 'dice', title: 'choice', sub: '왼쪽, 오른쪽', value: '왼쪽' })
  })

  it('표 결과: 표 이름 · 굴린 수 · 결과 문장 (결과 안의 ＞ 도 그대로)', () => {
    expect(c('유진', '[펌블표](2) ＞ 도구를 하나 잃는다.')).toEqual({ kind: 'table', title: '펌블표', roll: '2', result: '도구를 하나 잃는다.' })
    expect(c('유진', 'ET | 【감정표】 감정 표(3) ＞ 신뢰(플러스) / 경계(마이너스)')).toMatchObject({ kind: 'table', title: '감정표', roll: '3' })
    expect(c('유진', 'BMR 광기 발작(4) ＞ 잠시 기억을 잃는다.(1D10＞3라운드)')).toMatchObject({
      kind: 'table',
      title: '광기 발작',
      result: '잠시 기억을 잃는다.(1D10 ＞ 3라운드)',
    })
  })

  it('그 밖의 대사는 talk (괄호 · ＞ 가 있어도 굴림 모양이 아니면)', () => {
    expect(c('하늘', '안녕하세요 (웃음) ＞ ＜')).toEqual({ kind: 'talk' })
    expect(c('하늘', '메모\n1D4 손실 (1D4) ＞ 3')).toEqual({ kind: 'talk' })
    expect(c('하늘', '그냥 대사')).toEqual({ kind: 'talk' })
  })

  it('결과 단계 낱말', () => {
    expect(tierOf('대실패')).toBe('fumble')
    expect(tierOf('극단적 성공')).toBe('crit')
    expect(tierOf('보통 성공')).toBe('success')
    expect(tierOf('실패')).toBe('fail')
    expect(tierOf('3')).toBeUndefined()
  })
})
