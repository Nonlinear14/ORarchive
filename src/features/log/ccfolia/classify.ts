import { SYSTEM_SPEAKER, type CcfMessage } from './model'

/**
 * 메시지 글을 보고 종류를 알아본다 (저장하지 않는다 — 그릴 때마다 읽는다).
 * - system: 이름이 `system` 인 메시지. `[ 이름 ] 항목 : 전 → 후` 이면 나눠 읽는다
 * - dice: 코코포리아(BCDice) 굴림 결과 `명령 (식) ＞ … ＞ 결과` (choice 포함)
 * - table: 표 굴림 결과 `표 이름(굴린 수) ＞ 결과 문장`
 * - talk: 그 밖의 대사
 * 알아보지 못하면 언제나 talk 로 — 글은 그대로 보여 준다.
 */

export type Tier = 'crit' | 'success' | 'fail' | 'fumble'

export type Classified =
  | { kind: 'talk' }
  | { kind: 'system'; who?: string; label?: string; from?: string; to?: string }
  | { kind: 'dice'; title: string; sub: string; value: string; tier?: Tier; word?: string }
  | { kind: 'table'; title: string; roll: string; result: string }

/** 코코포리아 굴림 결과의 나눔표 ＞ (전각). 반각 > 는 식(1D100>=50) 안에 쓰이므로 나누지 않는다 */
const ARROW = '＞'

const SYSTEM_CHANGE = /^\[\s*(.+?)\s*\]\s*(.+?)\s*:\s*(.+?)\s*→\s*(.+?)\s*$/s

/** 결과 단계 낱말 → 단계 (앞에서부터 먼저 맞는 것) */
const TIERS: [RegExp, Tier][] = [
  [/^(대실패|치명적\s*실패|펌블|ファンブル|致命的失敗)/, 'fumble'],
  [/^(대성공|극단적\s*성공|결정적\s*성공|크리티컬|스페셜|クリティカル|スペシャル|決定的成功|極限成功)/, 'crit'],
  [/^(어려운\s*성공|보통\s*성공|성공|成功|ハード成功|レギュラー成功)/, 'success'],
  [/^(실패|失敗)/, 'fail'],
]

export function tierOf(word: string): Tier | undefined {
  const w = word.trim()
  for (const [re, tier] of TIERS) if (re.test(w)) return tier
  return undefined
}

/** 굴림 식처럼 보이는가: 주사위(2D6) · choice · 비교(<= >=) · 숫자 */
const DICE_EXPR = /\d*[dD]\d|choice|[<>]=?|^\s*\d+\s*$/i

/** "CC<=60  [ 이성 ]" · "2D6>=5 | 【조사술】" · "1D4 이성 손실" → { 명령, 이름 } */
function splitCommand(head: string): { command: string; label: string } {
  const trimmed = head.trim()
  const space = trimmed.search(/\s/)
  if (space < 0) return { command: trimmed, label: '' }
  const command = trimmed.slice(0, space)
  let label = trimmed.slice(space).trim().replace(/^\|\s*/, '')
  // [ 이성 ] · 【조사술】 처럼 괄호로 시작하면 그 안의 이름만 (뒤에 붙은 설명은 뺀다)
  const bracket = /^[[【「]\s*(.+?)\s*[\]】」]/.exec(label)
  if (bracket) label = bracket[1]
  return { command, label }
}

/** 표 이름 다듬기: 【감정표】 · [펌블표] 가 있으면 그 안의 이름, 앞의 영문 명령(ET · BMR …)은 뗀다 */
function tableTitle(name: string): string {
  const inner = /[[【]\s*([^\]】]+?)\s*[\]】]/.exec(name)
  if (inner) return inner[1]
  return name.replace(/^[A-Z][A-Za-z0-9]*\s+(\|\s*)?/, '').trim() || name.trim()
}

/** 맨 끝 괄호 묶음 `( … )` 의 위치 (괄호 짝 맞추기, 전각 괄호는 식이 아니므로 반각만) */
function lastParenGroup(head: string): { start: number; end: number } | null {
  const end = head.lastIndexOf(')')
  if (end < 0) return null
  let depth = 0
  for (let i = end; i >= 0; i--) {
    if (head[i] === ')') depth++
    else if (head[i] === '(') {
      depth--
      if (depth === 0) return { start: i, end }
    }
  }
  return null
}

export function classifyMessage(m: Pick<CcfMessage, 'speaker' | 'text'>): Classified {
  const text = m.text.trim()
  if (m.speaker === SYSTEM_SPEAKER) {
    const change = SYSTEM_CHANGE.exec(text)
    return change ? { kind: 'system', who: change[1], label: change[2], from: change[3], to: change[4] } : { kind: 'system' }
  }
  const first = text.indexOf(ARROW)
  if (first < 0 || text.includes('\n')) return { kind: 'talk' }
  const head = text.slice(0, first).trimEnd()
  const steps = text
    .slice(first + 1)
    .split(ARROW)
    .map((s) => s.trim())
  const group = lastParenGroup(head)
  if (!group || head.slice(group.end + 1).includes('(')) return { kind: 'talk' }
  const expr = head.slice(group.start + 1, group.end).trim()
  const before = head.slice(0, group.start).trim()
  const after = head.slice(group.end + 1).trim()
  if (!expr || !DICE_EXPR.test(expr)) return { kind: 'talk' }

  // 표: "펌블표(2) ＞ 문장" — 이름 바로 뒤에 굴린 수, 결과가 숫자가 아닌 문장
  const result = steps.join(` ${ARROW} `)
  if (/^\d+$/.test(expr) && !after && before && !/\s$/.test(head.slice(0, group.start)) && !/^[-\d\s,[\]]+$/.test(steps[0] ?? ''))
    return { kind: 'table', title: tableTitle(before), roll: expr, result }

  // 주사위 · choice
  const last = steps[steps.length - 1] ?? ''
  const tier = tierOf(last)
  const value = tier ? (steps[steps.length - 2] ?? '') : last
  const detail = tier && steps.length >= 3 ? steps[0] : steps.length >= 2 && !tier ? steps.slice(0, -1).join(` ${ARROW} `) : ''
  if (/^choice/i.test(before)) {
    const options = before.replace(/^choice\s*/i, '').replace(/^\((.*)\)$/s, '$1').trim()
    return { kind: 'dice', title: 'choice', sub: options, value }
  }
  const { command, label } = splitCommand(before)
  const formula = expr.replace(/<=/g, ' ≤ ').replace(/>=/g, ' ≥ ').replace(/\s+/g, ' ').trim()
  // 크툴루 7판: "보너스, 페널티 주사위[n]" → 보너스 주사위 n / 페널티 주사위 n (0 이면 뺀다)
  const bonus = after
    .replace(/보너스,\s*페널티\s*주사위\[(-?\d+)\]/, (_, n: string) => {
      const k = Number(n)
      return k > 0 ? `보너스 주사위 ${k}` : k < 0 ? `페널티 주사위 ${-k}` : ''
    })
    .trim()
  const extras = [bonus, detail && detail !== value ? `(${detail})` : '']
    .filter(Boolean)
    .join(' ')
  return {
    kind: 'dice',
    title: label || command,
    sub: [formula, extras].filter(Boolean).join(' · '),
    value,
    ...(tier ? { tier, word: last } : {}),
  }
}
