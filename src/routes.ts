import type { IconName } from './components/Icon'

export interface NavRoute {
  path: string
  label: string
  icon: IconName
  /** 페이지 헤딩 위 영문 eyebrow */
  eyebrow: string
  description: string
}

/** 사이드바 상위 메뉴. 하위 메뉴가 있으면 제목 역할만 하고, 없으면 제목을 눌러 route 로 이동한다 */
export interface NavSection {
  label: string
  /** 접힌 사이드바(≤1050px)에서만 보이는 아이콘 */
  icon: IconName
  /** 하위 메뉴가 없을 때 제목이 여는 화면 */
  route?: NavRoute
  children?: NavRoute[]
  /** 하위 메뉴에 라이트/다크 모드 토글을 붙인다 */
  themeToggle?: boolean
}

const homeRoute: NavRoute = {
  path: '/',
  label: '홈',
  icon: 'home',
  eyebrow: 'ORARCHIVE / CREATIVE WORKSPACE',
  description: '최근 작업한 템플릿과 캐릭터를 이어서 열어 보세요.',
}

export const navSections: NavSection[] = [
  {
    label: '템플릿 아카이브',
    icon: 'templates',
    children: [
      {
        path: '/templates',
        label: '템플릿 목록',
        icon: 'templates',
        eyebrow: 'TEMPLATE ARCHIVE / LIST',
        description: '내 핸드아웃과 롤꾸코드를 모아 보고, 골라서 바로 편집하세요.',
      },
      {
        path: '/studio/handout',
        label: '핸드아웃 편집',
        icon: 'handout',
        eyebrow: 'TEMPLATE ARCHIVE / HANDOUT EDITOR',
        description: '캔버스의 글자를 직접 클릭해 수정하고, 완성된 디자인을 Roll20 핸드아웃에 바로 붙여넣어 보세요.',
      },
      {
        path: '/studio/roll20code',
        label: '롤꾸코드 편집',
        icon: 'code',
        eyebrow: 'TEMPLATE ARCHIVE / ROLL20 CODE EDITOR',
        description: '템플릿 목록의 롤꾸코드를 고치고 Roll20에 바로 붙여 넣으세요.',
      },
    ],
  },
  {
    label: '로그 아카이브',
    icon: 'logs',
    children: [
      {
        path: '/logs',
        label: '로그 목록',
        icon: 'logs',
        eyebrow: 'LOG ARCHIVE / LIST',
        description: '불러온 세션 로그를 모아 보고, 열어서 이어서 편집하세요.',
      },
      {
        path: '/studio/log/roll20',
        label: 'Roll20 로그 편집',
        icon: 'logs',
        eyebrow: 'LOG ARCHIVE / ROLL20',
        description: 'Roll20 채팅 기록을 가져와 간단히 고치고 HTML로 내보내세요.',
      },
      {
        path: '/studio/log/ccfolia',
        label: '코코포리아 로그 편집',
        icon: 'logs',
        eyebrow: 'LOG ARCHIVE / CCFOLIA',
        description: '코코포리아 기록에 이미지를 넣고, 캐릭터별로 걸러 보고, 주사위 표시를 다듬어 보세요.',
      },
    ],
  },
  {
    label: '캐릭터 아카이브',
    icon: 'characters',
    route: {
      path: '/characters',
      label: '캐릭터 아카이브',
      icon: 'characters',
      eyebrow: 'CHARACTER ARCHIVE',
      description: '룰별 캐릭터 자료를 기록하고 안전하게 보관하세요.',
    },
  },
  {
    label: '설정',
    icon: 'settings',
    themeToggle: true,
    children: [
      {
        path: '/settings',
        label: '계정 설정',
        icon: 'settings',
        eyebrow: 'SETTING / ACCOUNT',
        description: '소셜 로그인 연결과 클라우드 데이터 저장 정책을 확인하세요.',
      },
    ],
  },
]

/** 메뉴에서 열 수 있는 모든 화면 (홈 포함) */
export const navRoutes: NavRoute[] = [
  homeRoute,
  ...navSections.flatMap((section) => (section.route ? [section.route] : (section.children ?? []))),
]

const extraTitles: Record<string, string> = {
  '/login': '로그인',
}

/** 현재 경로의 표시 이름 (브레드크럼·문서 제목용) */
export function pageLabel(pathname: string): string {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (normalized.startsWith('/documents/')) return '문서'
  if (normalized.startsWith('/studio/handout/')) return '핸드아웃 편집'
  if (normalized.startsWith('/studio/log/roll20/')) return 'Roll20 로그 편집'
  return (
    navRoutes.find((route) => route.path === normalized)?.label ??
    extraTitles[normalized] ??
    '페이지를 찾을 수 없음'
  )
}
