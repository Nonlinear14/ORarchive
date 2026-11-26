import { describe, expect, it } from 'vitest'
import type { DocumentContent } from '../../lib/documents'
import { deepFreeze } from '../../test/json'
import { blockRoll20Html, blockRoll20Text } from './blockRoll20'
import { layoutOf, resolveLayout, type LayoutRow } from './layout'
import { addBlock, moveBlock, removeBlock, setBlockStyle, setBlockText } from './layoutEdits'
import { serializeHandout } from './model'
import { createHandoutContent } from './templates'

const ids = (rows: LayoutRow[]) => rows.map((r) => r.blocks.map((b) => b.id).join('+'))
const start = (id: Parameters<typeof createHandoutContent>[0]) => deepFreeze(serializeHandout(createHandoutContent(id))) as DocumentContent

describe('템플릿 → 블록', () => {
  it('달빛의 초대: 머리 문구 · 제목 · 구분선(이미지 블록) · 본문 · 서명 · 장식 글자', () => {
    const layout = layoutOf(createHandoutContent('moonlit'))
    expect(ids(layout.rows)).toEqual(['f-cap', 'f-title', 'r-0', 'f-body', 'f-signature', 's-1', 's-2'])
    expect(layout.frames).toHaveLength(2)
    expect(layout.background).toBe('#e8ddc9')
    const rule = layout.rows[2].blocks[0]
    expect(rule).toMatchObject({ type: 'image', rule: { widthPercent: 70, color: '#9c795f' } })
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
    expect(layout.rows[0].blocks[1]).toMatchObject({ text: 'CONFIDENTIAL', style: { boxed: true, align: 'right' } })
  })

  it('비밀 결사의 인장은 인장 모양 텍스트 블록, 숲의 기록 본문은 세로 막대가 있는 텍스트 블록', () => {
    const order = layoutOf(createHandoutContent('order'))
    expect(order.rows[0].blocks[0]).toMatchObject({ id: 'f-seal', style: { seal: { size: 76 } } })
    const forest = layoutOf(createHandoutContent('forest'))
    const body = forest.rows.flatMap((r) => r.blocks).find((b) => b.id === 'f-body')!
    expect(body).toMatchObject({ style: { bar: { width: 3, gap: 16 } } })
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
    expect(resolveLayout(twice).rows[3].blocks[0]).toMatchObject({ style: { bold: true, size: 15 } })
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
    const rowId = resolveLayout(stored).rows[0].id
    stored = moveBlock('f-signature', { kind: 'before', rowId })(stored)
    expect(ids(resolveLayout(stored).rows)).toEqual(['f-signature', 'f-cap+f-title', 'r-0', 'f-body', 's-1', 's-2'])
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
