import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { renderableImage, type HandoutContent } from '../model'
import {
  boxedCss,
  frameInnerCss,
  frameOuterCss,
  imageCss,
  sealCss,
  textCss,
  type Align,
  type Css,
} from '../styles'
import { resolveLook, type Block, type HandoutLook } from '../templates'
import { EditableField } from './EditableField'
import { displayText } from './editableText'
import './HandoutCanvas.css'

const rs = (css: Css) => css as CSSProperties

interface Ctx {
  look: HandoutLook
  content: HandoutContent
  depth: number
  align: Align
  onFieldChange?: (key: string, value: string) => void
}

function renderField(ctx: Ctx, fieldKey: string, style: CSSProperties): ReactNode {
  const def = ctx.look.template.fields.find((f) => f.key === fieldKey)
  if (!def) return null
  const value = ctx.content.fields[fieldKey] ?? ''
  const onChange = ctx.onFieldChange
  if (onChange)
    return (
      <EditableField
        key={`${ctx.look.template.id}:${fieldKey}`}
        def={def}
        value={value}
        style={style}
        onChange={(next) => onChange(fieldKey, next)}
      />
    )
  // 읽기 전용(갤러리 미리보기): Roll20 출력처럼 빈 문자열인 선택 칸만 그리지 않는다 (공백 · 줄바꿈만 있는 칸은 내용)
  if (!value && def.optional) return null
  return (
    <div key={fieldKey} className="hc-field" style={style}>
      {value ? displayText(value) : ' '}
    </div>
  )
}

function renderBlocks(blocks: Block[], ctx: Ctx): ReactNode[] {
  return blocks.map((block, index) => renderBlock(block, ctx, index))
}

function renderBlock(block: Block, ctx: Ctx, index: number): ReactNode {
  const { look } = ctx
  const c = look.colors
  switch (block.kind) {
    case 'frame': {
      const align = block.align ?? ctx.align
      const width = ctx.depth === 0 ? `${look.template.width}px` : '100%'
      const outer = frameOuterCss(look, width, block.border)
      return (
        <div key={index} className="hc-frame" style={rs(outer)}>
          <div style={rs(frameInnerCss(look, block.padding, align, block.borderBottom))}>
            {renderBlocks(block.children, { ...ctx, depth: ctx.depth + 1, align })}
          </div>
        </div>
      )
    }
    case 'field':
      return renderField(ctx, block.field, rs(textCss(block.style, look, ctx.align)))
    case 'text': {
      const css = rs(textCss(block.style, look, ctx.align))
      return (
        <div key={index} className="hc-static" style={css} aria-hidden="true">
          {block.style.boxed ? <span style={rs(boxedCss(block.style, look))}>{block.text}</span> : block.text}
        </div>
      )
    }
    case 'rule':
      return (
        <div
          key={index}
          className="hc-rule"
          style={{
            width: `${block.widthPercent}%`,
            height: 1,
            background: c[block.color],
            margin: `${block.marginTop ?? 0}px auto ${block.marginBottom ?? 0}px`,
          }}
        />
      )
    case 'image': {
      const image = renderableImage(ctx.content.image)
      if (!image) return null
      return (
        <div key={index} style={{ margin: `0 0 ${block.marginBottom}px`, textAlign: 'center', lineHeight: 0 }}>
          <img src={image.url} alt={image.alt} referrerPolicy="no-referrer" style={rs(imageCss(block.maxWidth))} />
        </div>
      )
    }
    case 'seal':
      return (
        <div
          key={index}
          className="hc-seal"
          style={{ ...rs(sealCss(block.size, c[block.ring])), margin: '0 auto', boxSizing: 'border-box' }}
        >
          {renderField(ctx, block.field, rs(textCss(block.style, look, 'center')))}
        </div>
      )
    case 'meta': {
      const text = textCss(block.style, look, 'left')
      const cell: CSSProperties = { borderBottom: `1px dashed ${c[block.lineColor]}`, padding: '6px 0', verticalAlign: 'top' }
      return (
        <table key={index} className="hc-meta">
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.field}>
                <th scope="row" style={{ ...rs({ ...text, color: c[block.labelColor] }), ...cell, width: '32%' }}>
                  {row.label}
                </th>
                <td style={cell}>{renderField(ctx, row.field, rs(text))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    case 'split':
      return (
        <div key={index} className="hc-split">
          <div className="hc-split-left">{renderBlocks(block.left, { ...ctx, align: 'left' })}</div>
          <div className="hc-split-right">{renderBlocks(block.right, { ...ctx, align: 'right' })}</div>
        </div>
      )
    case 'aside':
      return (
        <div key={index} className="hc-aside">
          <div className="hc-aside-bar" style={{ width: block.barWidth, background: c[block.bar] }} />
          <div style={{ paddingLeft: block.gap, flex: 1, minWidth: 0 }}>
            {renderBlocks(block.children, { ...ctx, align: 'left' })}
          </div>
        </div>
      )
  }
}

interface HandoutCanvasProps {
  content: HandoutContent
  /** 지정하면 필드를 직접 편집할 수 있다. 없으면 읽기 전용 미리보기 */
  onFieldChange?(key: string, value: string): void
  label?: string
}

/** 템플릿 블록을 React 로 그린 핸드아웃 캔버스 (roll20.ts 와 같은 정의·같은 스타일 계산을 쓴다) */
export function HandoutCanvas({ content, onFieldChange, label }: HandoutCanvasProps) {
  const look = useMemo(() => resolveLook(content), [content])
  const ctx: Ctx = { look, content, depth: 0, align: 'center', onFieldChange }
  return (
    <div
      className={onFieldChange ? 'hc-canvas editable' : 'hc-canvas'}
      data-template={look.template.id}
      data-theme={look.theme.id}
      style={{ fontFamily: look.fontStack, color: look.colors.text }}
      role={onFieldChange ? 'group' : undefined}
      aria-label={label}
    >
      {renderBlocks(look.template.blocks, ctx)}
    </div>
  )
}
