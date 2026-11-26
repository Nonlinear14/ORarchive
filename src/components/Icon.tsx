import type { ReactNode } from 'react'

/** 목업(trpg_folio_mockup_v3.html)의 `icons` 경로 세트를 그대로 옮긴 것. */
const paths = {
  home: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  library: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M11 8h6M11 12h6" />
    </>
  ),
  templates: (
    <>
      <path d="M12 3l2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1z" />
      <path d="M19 3v4M17 5h4" />
    </>
  ),
  handout: (
    <>
      <path d="M8 3h9a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3V7a4 4 0 0 1 4-4z" />
      <path d="M8 3v5H4m5 5h7m-7 4h5" />
    </>
  ),
  logs: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 8h8m-8 4h8m-8 4h5" />
    </>
  ),
  characters: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  projects: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  settings: (
    <>
      <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M18.4 5.6l-2.1 2.1m-8.6 8.6l-2.1 2.1" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M16 16l5 5" />
    </>
  ),
  plus: <path d="M12 5v14m-7-7h14" />,
  chev: <path d="M9 18l6-6-6-6" />,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
  cloud: (
    <>
      <path d="M20 17a4 4 0 0 0-1.8-7.5A6.5 6.5 0 0 0 5.7 11 4 4 0 0 0 7 19h11" />
      <path d="m10 16 2 2 4-4" />
    </>
  ),
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  lock: (
    <>
      <rect x="4" y="10" width="16" height="12" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  trash: <path d="M4 7h16m-10 4v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  alert: (
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4m0 3v.01" />
    </>
  ),
  logout: <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4m-4 4h11" />,
  offline: (
    <>
      <path d="M20 17a4 4 0 0 0-1.8-7.5A6.5 6.5 0 0 0 5.7 11 4 4 0 0 0 7 19h11" />
      <path d="M4 4l16 16" />
    </>
  ),
  download: <path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" />,
  copy: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>
  ),
  edit: <path d="M4 20h4l12-12-4-4L4 16zM14 6l4 4" />,
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8" cy="8" r="2" />
      <path d="m21 16-5-5L5 21" />
    </>
  ),
  check: <path d="m5 12 5 5L20 7" />,
  code: <path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-12-2 12" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths

interface IconProps {
  name: IconName
  className?: string
}

export function Icon({ name, className }: IconProps) {
  return (
    <svg
      className={className ? `ico ${className}` : 'ico'}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
