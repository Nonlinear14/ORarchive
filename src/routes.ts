import type { IconName } from './components/Icon'

export interface NavRoute {
  path: string
  label: string
  icon: IconName
  /** 페이지 헤딩 위 영문 eyebrow */
  eyebrow: string
  description: string
}

export interface NavGroup {
  heading: string
  routes: NavRoute[]
}

export const navGroups: NavGroup[] = [
  {
    heading: 'WORKSPACE',
    routes: [
      {
        path: '/',
        label: '대시보드',
        icon: 'home',
        eyebrow: 'FOLIO / CREATIVE WORKSPACE',
        description: '모든 이야기와 창작물을 한 곳에서 관리하세요.',
      },
      {
        path: '/projects',
        label: '내 프로젝트',
        icon: 'projects',
        eyebrow: 'FOLIO / CREATIVE WORKSPACE',
        description: '하나의 캠페인에 핸드아웃, 로그, 캐릭터를 모아 관리합니다.',
      },
      {
        path: '/library',
        label: '내 보관함',
        icon: 'library',
        eyebrow: 'FOLIO / CREATIVE WORKSPACE',
        description: '내가 만든 모든 자료를 한곳에서 찾아보고 관리하세요.',
      },
    ],
  },
  {
    heading: 'CREATIVE STUDIO',
    routes: [
      {
        path: '/templates',
        label: '템플릿 갤러리',
        icon: 'templates',
        eyebrow: 'FOLIO / CREATIVE WORKSPACE',
        description: '취향에 맞는 디자인을 찾아 내 작업으로 복제해 보세요.',
      },
      {
        path: '/studio/handout',
        label: '핸드아웃 스튜디오',
        icon: 'handout',
        eyebrow: 'STUDIO / HANDOUT DESIGNER',
        description: '캔버스의 글자를 직접 클릭해 수정하고, 완성된 디자인을 Roll20 핸드아웃에 바로 붙여넣어 보세요.',
      },
      {
        path: '/studio/log',
        label: '로그 스튜디오',
        icon: 'logs',
        eyebrow: 'STUDIO / SESSION LOG',
        description: 'Roll20·코코포리아 기록을 가져와 정리하고 편집하세요.',
      },
      {
        path: '/characters',
        label: '캐릭터 시트',
        icon: 'characters',
        eyebrow: 'STUDIO / CHARACTER SHEET',
        description: '룰별 캐릭터 자료를 기록하고 안전하게 보관하세요.',
      },
    ],
  },
  {
    heading: 'ACCOUNT',
    routes: [
      {
        path: '/settings',
        label: '계정 설정',
        icon: 'settings',
        eyebrow: 'ACCOUNT / SETTINGS',
        description: '소셜 로그인 연결과 클라우드 데이터 저장 정책을 확인하세요.',
      },
    ],
  },
]

export const navRoutes: NavRoute[] = navGroups.flatMap((group) => group.routes)

/** 모바일 하단 내비게이션 (목업과 동일한 5개 항목) */
export const mobileNav: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: '홈', icon: 'home' },
  { path: '/templates', label: '템플릿', icon: 'templates' },
  { path: '/studio/log', label: '로그', icon: 'logs' },
  { path: '/characters', label: '캐릭터', icon: 'characters' },
  { path: '/library', label: '보관함', icon: 'library' },
]

const extraTitles: Record<string, string> = {
  '/login': '로그인',
}

/** 현재 경로의 표시 이름 (브레드크럼·문서 제목용) */
export function pageLabel(pathname: string): string {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return (
    navRoutes.find((route) => route.path === normalized)?.label ??
    extraTitles[normalized] ??
    '페이지를 찾을 수 없음'
  )
}
