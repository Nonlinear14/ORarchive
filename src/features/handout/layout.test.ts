import { describe, expect, it } from 'vitest'
import type { DocumentContent } from '../../lib/documents'
import { deepFreeze } from '../../test/json'
import { blockRoll20Html, blockRoll20Text } from './blockRoll20'
import { layoutOf, lineSegments, resolveLayout, type LayoutRow } from './layout'
import { addBlock, moveBlock, removeBlock, setBlockRule, setBlockValign, setBlockStyle, setBlockText, setRowSplit } from './layoutEdits'
import { serializeHandout } from './model'
import { applyToRange, normalizeRuns, rangeAllOn, rangeValue } from './richText'
import { setBlockContent } from './layoutEdits'
import { createHandoutContent } from './templates'

/** 공백 줄을 뺀 내용 줄 */
const body = (rows: LayoutRow[]) => rows.filter((r) => r.blocks[0].type !== 'space')
const ids = (rows: LayoutRow[]) => body(rows).map((r) => r.blocks.map((b) => b.id).join('+'))
const start = (id: Parameters<typeof createHandoutContent>[0]) => deepFreeze(serializeHandout(createHandoutContent(id))) as DocumentContent

describe('템플릿 → 블록', () => {
  it('달빛의 초대: 머리 문구 · 제목 · 구분선(이미지 블록) · 본문 · 서명 · 장식 글자', () => {
    const layout = layoutOf(createHandoutContent('moonlit'))
    expect(ids(layout.rows)).toEqual(['f-cap', 'f-title', 'r-0', 'f-body', 'f-signature', 's-1', 's-2'])
    expect(layout.frames).toHaveLength(2)
    expect(layout.background).toBe('#e8ddc9')
    const rule = body(layout.rows)[2].blocks[0]
    expect(rule).toMatchObject({ type: 'image', rule: { widthPercent: 70, color: '#9c795f' } })
  })

  it('블록 사이 간격은 공백 블록 (맞닿은 여백은 큰 쪽), 블록 자체 여백은 0', () => {
    const rows = layoutOf(createHandoutContent('moonlit')).rows
    const seq = rows.map((r) => (r.blocks[0].type === 'space' ? `[${r.blocks[0].height}]` : r.blocks[0].id))
    // 머리 문구 아래 44 · 제목 아래 22 · 구분선 아래 24 · 서명 위 26 · 맺음말 위 40 · 장식 위 18
    expect(seq).toEqual(['f-cap', '[44]', 'f-title', '[22]', 'r-0', '[24]', 'f-body', '[26]', 'f-signature', '[40]', 's-1', '[18]', 's-2'])
    for (const r of rows) for (const b of r.blocks) if (b.type === 'text') expect([b.style.marginTop ?? 0, b.style.marginBottom ?? 0]).toEqual([0, 0])
    const html = blockRoll20Html(layoutOf(createHandoutContent('moonlit')))
    expect(html).toContain('<td height="44" style=')
  })

  it('공백은 2열에 놓을 수 없다', () => {
    const stored = start('moonlit')
    expect(moveBlock('sp-0', { kind: 'beside', blockId: 'f-title', side: 'right' })(stored)).toBe(stored)
    expect(moveBlock('f-title', { kind: 'beside', blockId: 'sp-0', side: 'left' })(stored)).toBe(stored)
  })

  it('오래된 조사 기록: 머리칸은 2열 행, 서류 칸은 이름표 + 값 2열 행, 머리칸 아래 선은 구분선 블록', () => {
    const layout = layoutOf(createHandoutContent('casefile'))
    expect(ids(layout.rows)).toEqual([
      'f-cap+s-0',
      'r-1',
      'f-title',
      'm-caseNo+f-caseNo',
      'm-date+f-date',
      'm-agent+f-agent',
      'r-2',
      'f-body',
      'f-signature',
      's-3',
    ])
    expect(body(layout.rows)[0].blocks[1]).toMatchObject({ text: 'CONFIDENTIAL', style: { boxed: true, align: 'right' } })
  })

  it('비밀 결사의 인장은 인장 모양 텍스트 블록, 숲의 기록 본문은 세로 막대가 있는 텍스트 블록', () => {
    const order = layoutOf(createHandoutContent('order'))
    expect(body(order.rows)[0].blocks[0]).toMatchObject({ id: 'f-seal', style: { seal: { size: 76 } } })
    const forest = layoutOf(createHandoutContent('forest'))
    const bodyBlock = forest.rows.flatMap((r) => r.blocks).find((b) => b.id === 'f-body')!
    expect(bodyBlock).toMatchObject({ style: { bar: { width: 3, gap: 16 } } })
  })
})

describe('블록 편집 연산', () => {
  it('처음 편집은 보이던 블록을 적고, 다음 편집은 그 블록만', () => {
    const stored = start('moonlit')
    const once = setBlockText('f-title', '새 제목')(stored)
    expect(resolveLayout(once).rows.map((r) => r.blocks[0].id)).toEqual(resolveLayout(stored).rows.map((r) => r.blocks[0].id))
    const twice = setBlockStyle('f-body', { bold: true, size: 15 })(once)
    const rows = (twice.layout as unknown as { rows: LayoutRow[] }).rows
    const before = (once.layout as unknown as { rows: LayoutRow[] }).rows
    expect(rows[0]).toEqual(before[0]) // 고치지 않은 행은 그대로
    expect(body(resolveLayout(twice).rows)[3].blocks[0]).toMatchObject({ style: { bold: true, size: 15 } })
  })

  it('옮기기: 다른 블록의 오른쪽에 놓으면 2열, 3열은 안 되고, 빈 행은 지운다', () => {
    let stored = start('moonlit')
    stored = moveBlock('f-signature', { kind: 'beside', blockId: 'f-body', side: 'right' })(stored)
    expect(ids(resolveLayout(stored).rows)).toEqual(['f-cap', 'f-title', 'r-0', 'f-body+f-signature', 's-1', 's-2'])
    // 이미 2열인 행 옆에는 놓을 수 없다 (그대로)
    expect(moveBlock('s-1', { kind: 'beside', blockId: 'f-body', side: 'left' })(stored)).toBe(stored)
    // 왼쪽에 놓기
    stored = moveBlock('f-cap', { kind: 'beside', blockId: 'f-title', side: 'left' })(stored)
    expect(ids(resolveLayout(stored).rows)[0]).toBe('f-cap+f-title')
    // 2열에서 빼서 위 행으로
    const rowId = body(resolveLayout(stored).rows)[0].id
    stored = moveBlock('f-signature', { kind: 'before', rowId })(stored)
    expect(ids(resolveLayout(stored).rows)).toEqual(['f-signature', 'f-cap+f-title', 'r-0', 'f-body', 's-1', 's-2'])
  })

  it('2열 너비(split): 20–80 정수로 맞추고, 롤꾸 복사 칸 너비 · 세로 정렬에 쓴다', () => {
    let stored = moveBlock('f-signature', { kind: 'beside', blockId: 'f-body', side: 'right' })(start('moonlit'))
    const rowId = body(resolveLayout(stored).rows)[3].id
    expect(body(resolveLayout(stored).rows)[3].split).toBeUndefined()
    stored = setRowSplit(rowId, 91.6)(stored)
    expect(body(resolveLayout(stored).rows)[3].split).toBe(80)
    stored = setRowSplit(rowId, 63.4)(stored)
    expect(setRowSplit(rowId, 63)(stored)).toBe(stored)
    const html = blockRoll20Html(resolveLayout(stored))
    expect(html).toMatch(/<td width="63%" valign="middle"[^>]*>.*<\/td><td width="37%" valign="middle"[^>]*>.*블랙우드/)
    const top = blockRoll20Html(resolveLayout(setBlockValign('f-signature', 'top')(stored)))
    expect(top).toMatch(/<td width="37%" valign="top"[^>]*vertical-align:top;/)
  })

  it('구분선은 2열에 놓을 수 없다 (구분선을 옆에 · 구분선 옆에)', () => {
    const stored = start('moonlit')
    expect(moveBlock('r-0', { kind: 'beside', blockId: 'f-title', side: 'right' })(stored)).toBe(stored)
    expect(moveBlock('f-title', { kind: 'beside', blockId: 'r-0', side: 'left' })(stored)).toBe(stored)
    // 위아래로는 옮길 수 있다
    const moved = moveBlock('r-0', { kind: 'before', rowId: 'row-f-title' })(stored)
    expect(ids(resolveLayout(moved).rows).slice(0, 3)).toEqual(['f-cap', 'r-0', 'f-title'])
  })

  it('추가는 고른 블록이 있는 행 아래(없으면 맨 아래), 삭제는 그 블록만', () => {
    let stored = start('moonlit')
    stored = addBlock({ id: 'n1', type: 'text', text: '', style: { size: 14, color: '#000000' } }, 'f-title')(stored)
    stored = addBlock({ id: 'n2', type: 'image', maxWidth: 300 }, null)(stored)
    expect(ids(resolveLayout(stored).rows)).toEqual(['f-cap', 'f-title', 'n1', 'r-0', 'f-body', 'f-signature', 's-1', 's-2', 'n2'])
    stored = removeBlock('r-0')(stored)
    expect(ids(resolveLayout(stored).rows)).not.toContain('r-0')
  })
})

describe('구분선 모양', () => {
  it('lineSegments: 길이를 채우고 마지막 조각은 자른다 · 굵기에 맞춘 선분 · 점 · 간격', () => {
    expect(lineSegments(100, 'solid', 3)).toEqual([{ on: true, w: 100 }])
    expect(lineSegments(10, 'dotted', 1)).toEqual([
      { on: true, w: 1 }, { on: false, w: 3 }, { on: true, w: 1 }, { on: false, w: 3 }, { on: true, w: 1 }, { on: false, w: 1 },
    ])
    const dd = lineSegments(60, 'dashdotdot', 2) // 선분 8 · 간격 4 · 점 2
    expect(dd.slice(0, 6).map((s) => s.w)).toEqual([8, 4, 2, 4, 2, 4])
    expect(dd.reduce((n, s) => n + s.w, 0)).toBe(60)
  })

  it('롤꾸 복사: 구분선 조각은 표 칸 (선분 · 점은 bgcolor, 간격은 빈 칸), 길이 · 굵기 그대로', () => {
    const stored = setBlockRule('r-0', { length: 40, thickness: 2, style: 'dotted' })(start('moonlit'))
    const html = blockRoll20Html(resolveLayout(stored))
    const table = html.match(/<table width="40"[^>]*>.*?<\/table>/)![0]
    expect(table.match(/<td /g)).toHaveLength(14) // (점 2 + 간격 4) × 6 + 점 2 + 간격 2
    expect(table).toContain('<td width="2" height="2" bgcolor="#9c795f"')
    expect(table).toContain('<td width="4" height="2" style=')
  })
})

describe('롤꾸 복사 (블록)', () => {
  const html = blockRoll20Html(layoutOf(createHandoutContent('casefile')))

  it('표 기반 · 인라인 스타일만 · class/style/script 없음 · Pretendard', () => {
    expect(html.startsWith('<table ')).toBe(true)
    expect(html).not.toMatch(/\sclass=|<style|<script/)
    expect(html).toContain('font-family:Pretendard')
  })

  it('2열 행은 칸 두 개짜리 표, 구분선은 1px 표, 도장은 테두리 글자', () => {
    expect(html).toMatch(/<td width="50%"[^>]*>.*CASE FILE \/ 1927.*<\/td><td width="50%"[^>]*>.*CONFIDENTIAL/)
    expect(html).toContain('height="1" bgcolor="#b9a47c"')
    expect(html).toContain('border:2px solid #9b3b2f')
  })

  it('사용자 글자는 이스케이프하고 공백 · 줄바꿈을 지킨다 · 평문도 같은 블록', () => {
    const stored = setBlockText('f-title', '  <제목>\n둘째 줄')(start('moonlit'))
    const layout = resolveLayout(stored)
    expect(blockRoll20Html(layout)).toContain('&nbsp;&nbsp;&lt;제목&gt;<br>둘째 줄')
    expect(blockRoll20Text(layout)).toContain('  <제목>\n둘째 줄')
  })
})

describe('일부 글자 꾸밈 (runs)', () => {
  const style = { size: 14, color: '#333333', bold: true }
  it('범위에만 적용 · 블록과 같은 값은 빼고 · 이웃 조각은 합친다 · 꾸밈이 없으면 runs 없음', () => {
    const runs = normalizeRuns(applyToRange('가나다라마', undefined, 1, 3, { color: '#ff0000', italic: true }), style)
    expect(runs).toEqual([{ t: '가' }, { t: '나다', s: { color: '#ff0000', italic: true } }, { t: '라마' }])
    expect(rangeValue('가나다라마', runs, style, 1, 3, 'color')).toBe('#ff0000')
    expect(rangeAllOn('가나다라마', runs, style, 0, 5, 'italic')).toBe(false)
    expect(rangeAllOn('가나다라마', runs, style, 0, 5, 'bold')).toBe(true)
    // 다시 블록 색으로 되돌리면 꾸밈이 사라진다
    expect(normalizeRuns(applyToRange('가나다라마', runs, 0, 5, { color: '#333333', italic: false }), style)).toBeUndefined()
  })

  it('블록 전체 꾸밈은 조각의 같은 꾸밈을 지우고, 롤꾸 복사는 조각마다 span (밑줄 · 취소선 포함)', () => {
    let stored = setBlockContent('f-title', 'AB', [{ t: 'A', s: { color: '#ff0000', underline: true } }, { t: 'B' }])(start('moonlit'))
    let html = blockRoll20Html(resolveLayout(stored))
    expect(html).toContain('<span style="color:#ff0000;text-decoration:underline;">A</span>B')
    stored = setBlockStyle('f-title', { color: '#00ff00', strike: true })(stored)
    const title = resolveLayout(stored).rows.flatMap((r) => r.blocks).find((b) => b.id === 'f-title')!
    expect(title).toMatchObject({ runs: [{ t: 'A', s: { underline: true } }, { t: 'B' }] })
    html = blockRoll20Html(resolveLayout(stored))
    expect(html).toContain('<span style="text-decoration:underline line-through;">A</span><span style="text-decoration:line-through;">B</span>')
    stored = setBlockStyle('f-title', { underline: true })(stored)
    expect(resolveLayout(stored).rows.flatMap((r) => r.blocks).find((b) => b.id === 'f-title')).not.toHaveProperty('runs')
  })
})
