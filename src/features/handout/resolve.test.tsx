import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { randomCorpus, storedCorpus, type StoredCase } from '../../test/handoutCorpus'
import { blockRoll20Html, blockRoll20Text } from './blockRoll20'
import { BlockCanvas } from './canvas/BlockCanvas'
import { layoutOf, resolveLayout } from './layout'
import { setBlockText } from './layoutEdits'
import {
  fontChoices,
  isFontChoice,
  isStructuredHandout,
  normalizeHex,
  templateIds,
  validateImageUrl,
  type HandoutContent,
} from './model'
import { escapeHtml } from './roll20'
import { createHandoutContent, getTemplate, resolveHandout, resolveLook } from './templates'

/*
 * 화면 · 출력은 저장된 값이 무엇이든 검사 · 정규화한 값만 쓴다.
 * 쓸 수 없는 저장 값(위험한 색 · https 가 아닌 주소 · 없는 테마/글꼴/템플릿)은 저장된 채로 두고, 그릴 때는 기본값을 쓴다.
 */

type Stored = Record<string, unknown>

const isPlainObject = (value: unknown): value is Stored => typeof value === 'object' && value !== null && !Array.isArray(value)
const at = (value: unknown, key: string): unknown => (isPlainObject(value) ? value[key] : undefined)
const HEX = /^#[0-9a-f]{6}$/
const DANGEROUS = /javascript:|data:|url\(|expression|http:/i

/** 저장된 이미지 주소를 검사 · 정규화한 주소 (그릴 수 없으면 null) */
function expectedImageUrl(content: Stored): string | null {
  const url = at(content.image, 'url')
  if (typeof url !== 'string') return null
  const check = validateImageUrl(url)
  return check.ok ? check.url : null
}

/** 저장된 값으로 그려야 하는 강조 색: 쓸 수 있으면 정규화한 값, 아니면 테마 기본값 */
function expectedAccent(content: Stored, themeAccent: string): string {
  return normalizeHex(at(content.style, 'accent')) ?? themeAccent
}

const rgb = (hex: string) =>
  `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`

const cases: StoredCase[] = [...storedCorpus, ...randomCorpus(300, 7)]

function expectResolvedView({ name, content }: StoredCase) {
  const stored = content as Stored
  const view = resolveHandout(content)
  const template = getTemplate(view.templateId)
  expect(templateIds, name).toContain(view.templateId)
  expect(template.themes.map((t) => t.id), name).toContain(view.theme)
  expect(view.style.accent, name).toBe(normalizeHex(at(stored.style, 'accent')) ?? undefined)
  if (view.style.accent !== undefined) expect(view.style.accent, name).toMatch(HEX)
  const font = at(stored.style, 'font')
  expect(view.style.font, name).toBe(isFontChoice(font) ? font : undefined)
  expect(view.image?.url ?? null, name).toBe(isPlainObject(stored.image) ? expectedImageUrl(stored) : null)
  for (const value of Object.values(view.fields)) expect(typeof value, name).toBe('string')
  // 저장된 글은 빈 문자열("")까지 그대로 보인다. 기본 문구는 legacy 의 저장된 적 없는 칸에만 (리뷰 회귀: { text: "" } → 기본 본문)
  for (const field of template.fields) {
    const label = `${name}: ${field.key}`
    if (isStructuredHandout(content)) {
      const value = at(stored.fields, field.key)
      expect(view.fields[field.key], label).toBe(typeof value === 'string' ? value : undefined)
    } else {
      const text = field.key === 'body' ? stored.text : undefined
      expect(view.fields[field.key], label).toBe(typeof text === 'string' ? text : field.defaultText)
    }
  }
}

describe('보기(resolveHandout) — 저장된 값이 무엇이든 검사 · 정규화한 값만', () => {
  it.each(storedCorpus.map((c) => [c.name, c] as const))('%s', (_, c) => expectResolvedView(c))

  it('무작위 저장 content 300개 (고정 시드)', () => {
    for (const c of randomCorpus(300, 7)) expectResolvedView(c)
  })
})

describe('Roll20 HTML · 평문 · 캔버스 — 쓸 수 없는 값은 그리지 않고, 정규화한 값으로 그린다', () => {
  it('모양(resolveLook): 색은 모두 #rrggbb, 강조 색은 정규화한 저장 값이나 테마 기본값, 글꼴은 정해진 목록', () => {
    for (const { name, content } of cases) {
      const look = resolveLook(resolveHandout(content))
      for (const color of Object.values(look.colors)) expect(color, name).toMatch(HEX)
      expect(look.colors.accent, name).toBe(expectedAccent(content as Stored, look.theme.colors.accent))
      expect(fontChoices, name).toContain(look.font)
    }
  })

  it('Roll20 HTML: 속성에는 정규화한 색 · 검사한 https 주소만 (위험한 값 없음)', () => {
    for (const { name, content } of cases) {
      const view = resolveHandout(content)
      const look = resolveLook(view)
      const colors = Object.values(look.colors)
      const html = blockRoll20Html(layoutOf(view))
      const url = isPlainObject(content.image) ? expectedImageUrl(content as Stored) : null
      for (const [, attr, value] of html.matchAll(/\s([a-z-]+)="([^"]*)"/g)) {
        expect(value, `${name}: ${attr}`).not.toMatch(DANGEROUS)
        if (attr === 'style' || attr === 'bgcolor')
          for (const color of value.match(/#[0-9a-zA-Z]+/g) ?? []) expect(colors, `${name}: ${attr} ${color}`).toContain(color)
        if (attr === 'src') expect(value, name).toBe(escapeHtml(url ?? ''))
        if (attr === 'alt') expect(value, name).toBe(escapeHtml(view.image?.alt ?? ''))
      }
      expect(html.includes('<img '), name).toBe(url !== null)
      if (url) expect(html, name).toContain(`src="${escapeHtml(url)}"`)

      const text = blockRoll20Text(layoutOf(view))
      if (url) expect(text, name).toContain('[이미지')
      else expect(text, name).not.toContain('[이미지')
      expect(text, name).not.toMatch(/javascript:|data:image|http:\/\//)
    }
  })

  it('캔버스: img 는 검사한 주소만, 인라인 스타일에는 정규화한 색만 (위험한 값 없음)', () => {
    for (const { name, content } of [...storedCorpus, ...randomCorpus(120, 11)]) {
      const view = resolveHandout(content)
      const look = resolveLook(view)
      const colors = Object.values(look.colors)
      const allowed = [...colors, ...colors.map(rgb)]
      const url = isPlainObject(content.image) ? expectedImageUrl(content as Stored) : null
      const { container, unmount } = render(<BlockCanvas layout={layoutOf(view)} />)
      const images = Array.from(container.querySelectorAll('img'))
      expect(images.map((img) => img.getAttribute('src')), name).toEqual(url ? [url] : [])
      expect(container.innerHTML, name).not.toMatch(DANGEROUS)
      for (const el of container.querySelectorAll('[style]')) {
        const style = el.getAttribute('style') ?? ''
        expect(style, name).not.toMatch(/\bred\b/)
        for (const color of style.match(/rgba?\([^)]*\)|#[0-9a-zA-Z]+/g) ?? []) expect(allowed, `${name}: ${color}`).toContain(color)
      }
      unmount()
    }
  })

  it('그리는 쪽의 두 번째 방어: resolveHandout 를 거치지 않은 보기라도 위험한 주소 · 색 · 글꼴은 그리지 않는다', () => {
    const base = createHandoutContent('moonlit')
    const unsafe = {
      ...base,
      style: { accent: 'url(javascript:alert(1))', font: 'x;background:url(javascript:alert(1))' },
      image: { url: 'javascript:alert(1)', alt: 'x' },
    } as unknown as HandoutContent
    const html = blockRoll20Html(layoutOf(unsafe))
    expect(html).not.toMatch(DANGEROUS)
    expect(html).not.toContain('<img')
    expect(blockRoll20Text(layoutOf(unsafe))).not.toContain('javascript:')
    const look = resolveLook(unsafe)
    expect(look.colors.accent).toBe(getTemplate('moonlit').themes[0].colors.accent)
    expect(look.font).toBe(getTemplate('moonlit').defaultFont)
    const { container } = render(<BlockCanvas layout={layoutOf(unsafe)} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.innerHTML).not.toMatch(DANGEROUS)
  })

  it('편집한 뒤에도 출력은 정규화한 값: 저장된 #ABC · 대문자 호스트는 그대로 남고, Roll20 HTML 에는 #aabbcc · 소문자 호스트', () => {
    const stored = {
      v: 1,
      templateId: 'moonlit',
      theme: 'classic',
      fields: { title: '제목', body: '본문' },
      style: { accent: '#ABC' },
      image: { url: 'https://EXAMPLE.com/map.png', alt: '지도' },
    }
    const edited = setBlockText('f-body', '새 본문')(stored)
    expect(edited).toMatchObject({ style: { accent: '#ABC' }, image: { url: 'https://EXAMPLE.com/map.png' } })
    const html = blockRoll20Html(resolveLayout(edited))
    expect(html).toContain('#aabbcc')
    expect(html).not.toContain('#ABC')
    expect(html).toContain('src="https://example.com/map.png"')
    expect(html).toContain('새 본문')
  })
})
