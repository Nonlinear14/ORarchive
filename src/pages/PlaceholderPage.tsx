import { PageHeading } from '../components/PageHeading'
import type { NavRoute } from '../routes'
import { ComingSoon } from './ComingSoon'

interface PlaceholderPageProps {
  route: NavRoute
}

export function PlaceholderPage({ route }: PlaceholderPageProps) {
  return (
    <>
      <PageHeading title={route.label} description={route.description} eyebrow={route.eyebrow} />
      <ComingSoon />
    </>
  )
}
