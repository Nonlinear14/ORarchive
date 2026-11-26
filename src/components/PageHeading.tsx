import type { ReactNode } from 'react'
import './PageHeading.css'

interface PageHeadingProps {
  title: string
  description?: string
  eyebrow?: string
  action?: ReactNode
}

export function PageHeading({
  title,
  description,
  eyebrow = 'FOLIO / CREATIVE WORKSPACE',
  action,
}: PageHeadingProps) {
  return (
    <div className="heading">
      <title>{`${title} · ORarchive`}</title>
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}
