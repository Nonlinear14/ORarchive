import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentContent } from '../../../lib/documents'
import { createFakeSupabase } from '../../../test/fakeSupabase'
import { changedPaths, deepFreeze } from '../../../test/json'
import { renderApp } from '../../../test/renderApp'
import { blockRoll20Html } from '../blockRoll20'
import { resolveLayout } from '../layout'

/*
 * 블록 편집도 고친 값만 저장한다.
 * - 블록 편집을 처음 할 때는 화면에 보이던 블록을 그대로 layout.rows 에 적는다. 이전 칸(fields) · 템플릿 · 테마 · 모르는 키는 그대로.
 * - 그다음부터는 고친 블록의 고친 값만 바뀐다. 쓸 수 없는 저장 값은 화면 · 출력에서만 기본값으로 그리고 저장 값은 그대로 둔다.
 */

afterEach(() => {
  vi.useRealTimers()
})

type Stored = { [key: string]: unknown }

const block = (id: string) => document.querySelector<HTMLElement>(`.hb-canvas.editable [data-block-id="${id}"]`)!
const textBox = (id: string) => block(id).querySelector<HTMLElement>('[data-hfield]')!

function typeInto(el: HTMLElement, text: string) {
  el.textContent = text
  fireEvent.input(el)
}

async function openStudio(content: Stored) {
  const fake = createFakeSupabase()
  // 저장된 원본은 얼려 둔다 — 어디서든 원본을 고치면(strict mode) 바로 오류가 난다
  const row = fake.control.insertDocument({
    type: 'handout',
    title: '저장 값 보존',
    content: deepFreeze(structuredClone(content)) as DocumentContent,
  })
  renderApp(`/studio/handout/${row.id}`, { client: fake.client })
  await screen.findByRole('group', { name: '핸드아웃 캔버스' })
  vi.useFakeTimers()
  const saved = () => fake.control.tables.documents.find((d) => d.id === row.id)!.content as Stored
  const updates = () => fake.control.calls.filter((c) => c.op === 'update').length
  const settle = () => act(() => vi.advanceTimersByTimeAsync(800))
  return { saved, updates, settle }
}

const MOONLIT = {
  v: 1,
  templateId: 'moonlit',
  theme: 'classic',
  fields: { cap: 'A PRIVATE INVITATION', title: '달빛 아래의 초대장', body: '본문', signature: '', hidden: '다른 템플릿의 칸' },
  style: { accent: '#ABC', font: 'serif' },
  image: null,
  unknown: { keep: [1, 2, 3] },
}

describe('핸드아웃 스튜디오 — 블록 편집도 고친 값만 저장된다', () => {
  it('열기만 하면 저장하지 않는다 · 비워 둔 선택 칸("")은 블록으로 보이지 않는다', async () => {
    const { updates, settle } = await openStudio(MOONLIT)
    await settle()
    expect(updates()).toBe(0)
    expect(block('f-signature')).toBeNull()
    expect(textBox('f-title')).toHaveTextContent('달빛 아래의 초대장')
  })

  it('처음 고칠 때: 보이던 블록을 layout.rows 에 적고, 그 밖의 저장 값은 한 글자도 바꾸지 않는다', async () => {
    const { saved, settle } = await openStudio(MOONLIT)
    typeInto(textBox('f-body'), '고친 본문')
    await settle()
    expect(changedPaths(MOONLIT, saved())).toEqual(['layout'])
    const rows = (saved().layout as { rows: { blocks: { id: string; text?: string }[] }[] }).rows
    const blocks = rows.flatMap((r) => r.blocks)
    expect(blocks.map((b) => b.id)).toEqual(['f-cap', 'f-title', 'r-0', 'f-body', 's-1', 's-2'])
    expect(blocks.find((b) => b.id === 'f-body')!.text).toBe('고친 본문')
    // 보이던 모양 그대로 (강조 색 #ABC 가 들어간 머리 문구 색)
    expect(blocks.find((b) => b.id === 'f-cap')).toMatchObject({ style: { color: '#aabbcc', size: 11, letterSpacing: 4 } })
  })

  it('그다음부터는 고친 블록의 고친 값만: 다른 블록 · 블록 안의 모르는 키 · 쓸 수 없는 값은 그대로', async () => {
    const stored = {
      ...MOONLIT,
      style: { ...MOONLIT.style, background: '#E0D9E8' },
      layout: {
        rows: [
          { id: 'row-a', blocks: [{ id: 'a', type: 'text', text: '첫 블록', style: { size: 14, color: 'not-a-color' }, note: '모르는 키' }] },
          {
            id: 'row-b',
            blocks: [
              { id: 'b', type: 'text', text: '왼쪽', style: { size: 12, color: '#123456' } },
              { id: 'c', type: 'image', url: 'https://CDN.example.com/a.png', alt: '그림', maxWidth: 200 },
            ],
          },
        ],
        extra: true,
      },
    }
    const { saved, settle } = await openStudio(stored)
    // 쓸 수 없는 색은 화면에서만 본문 색으로
    expect(textBox('a').style.color).toBe('rgb(102, 88, 71)')
    expect(block('b').closest('.hb-row')).toHaveClass('two')
    typeInto(textBox('b'), '고친 왼쪽')
    await settle()
    expect(changedPaths(stored, saved())).toEqual(['layout.rows'])
    const rows = (saved().layout as { rows: unknown[] }).rows
    expect(rows[0]).toEqual(stored.layout.rows[0])
    expect(changedPaths(stored.layout.rows[1], rows[1])).toEqual(['blocks'])
    expect((rows[1] as { blocks: unknown[] }).blocks).toEqual([{ ...stored.layout.rows[1].blocks[0], text: '고친 왼쪽' }, stored.layout.rows[1].blocks[1]])
  })

  it('Phase 1 의 { text: "" }: 빈 본문으로 보이고, 다른 블록을 고치면 템플릿 · 빈 본문 블록을 적되 text 는 그대로', async () => {
    const stored = { text: '', other: '남는 값' }
    const { saved, settle } = await openStudio(stored)
    expect(textBox('f-body').textContent).toBe('')
    typeInto(textBox('f-title'), '새 제목')
    await settle()
    expect(changedPaths(stored, saved())).toEqual(['layout', 'templateId', 'v'])
    const blocks = (saved().layout as { rows: { blocks: { id: string; text?: string }[] }[] }).rows.flatMap((r) => r.blocks)
    expect(blocks.find((b) => b.id === 'f-body')!.text).toBe('')
    expect(blocks.find((b) => b.id === 'f-title')!.text).toBe('새 제목')
  })

  it('배경색만 바꾸면 style.background 만 바뀐다 (블록은 적지 않는다)', async () => {
    const { saved, settle } = await openStudio(MOONLIT)
    fireEvent.change(screen.getByLabelText('배경색 HEX 코드'), { target: { value: '#112233' } })
    fireEvent.submit(screen.getByLabelText('배경색 HEX 코드'))
    await settle()
    expect(changedPaths(MOONLIT, saved())).toEqual(['style.background'])
  })

  it('롤꾸 복사 출력은 검사한 값만 쓴다 (쓸 수 없는 주소 · 색은 빠지거나 기본값)', () => {
    const layout = resolveLayout({
      ...MOONLIT,
      layout: {
        rows: [
          { id: 'r1', blocks: [{ id: 'x', type: 'image', url: 'javascript:alert(1)', maxWidth: 100 }] },
          { id: 'r2', blocks: [{ id: 'y', type: 'text', text: '<b>글</b>', style: { size: 99, color: 'red;background:url(x)' } }] },
        ],
      },
    } as unknown as DocumentContent)
    const html = blockRoll20Html(layout)
    expect(html).not.toContain('javascript')
    expect(html).not.toContain('url(x)')
    expect(html).toContain('&lt;b&gt;글&lt;/b&gt;')
    expect(html).toContain('font-size:48px')
  })
})
