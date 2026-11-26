import type { DocumentContent } from '../lib/documents'

/*
 * 저장된 핸드아웃 content 모음 (속성 테스트용).
 * 정규화하면 표기가 바뀌는 값 · 쓸 수 없는 값 · 이 버전이 모르는 키 · 숨은 칸 · 이전 형식(legacy) · 객체가 아닌 자리.
 */

export interface StoredCase {
  name: string
  content: DocumentContent
}

/** JSON 에서 읽은 그대로 (자기 키로 들어 있는 __proto__ 등) */
const fromJson = (text: string) => JSON.parse(text) as DocumentContent

export const storedCorpus: StoredCase[] = [
  {
    name: '대문자 hex · 대문자 호스트 · 퍼센트 인코딩 · 한글 경로 · 알 수 없는 키',
    content: {
      v: 1,
      templateId: 'moonlit',
      theme: 'dark',
      fields: { cap: 'CAP', title: '제목  ', body: '본문\n  둘째 줄 ', signature: '', 'bad key': 'x', count: 3 },
      style: { accent: '#ABC', font: 'hand', weight: 'bold' },
      image: { url: 'https://EXAMPLE.com/Maps/%7Euser/지도.png', alt: ' 저택 지도 ', caption: '캡션' },
      extra: { nested: [1, 'two', null], flag: true },
    },
  },
  {
    name: '# 없는 3자리 hex · 앞뒤 공백 주소 · 미래 버전 표시',
    content: {
      v: 2,
      templateId: 'order',
      theme: 'crimson',
      fields: { title: '봉인', seal: '✠', motto: '', body: '', signature: '— 서기관' },
      style: { accent: 'abc' },
      image: { url: ' https://cdn.example.com/map.png ', alt: '' },
    },
  },
  {
    name: '앞뒤 공백 hex · 대문자 스킴 · 기본 포트 · 점 경로 · 따옴표 쿼리',
    content: {
      templateId: 'forest',
      theme: 'birch',
      fields: { title: '숲', date: '봄', body: '기록' },
      style: { accent: ' #A1b2C3 ', font: 'sans' },
      image: { url: 'HTTPS://cdn.Example.COM:443/a/./b/../Map.PNG?q="x"&r=<y>', alt: '지도 <1> & "q" \'s' },
    },
  },
  {
    name: '소문자 퍼센트 인코딩 · 공백 경로 · 대체 텍스트 없음',
    content: {
      v: 1,
      templateId: 'casefile',
      theme: 'ash',
      fields: { cap: '', title: '사건', caseNo: '№ 1', date: '일자', agent: '담당', body: '본문', signature: '' },
      style: {},
      image: { url: 'https://example.com/%7euser/a%2Fb c.png' },
    },
  },
  {
    name: '쓸 수 없는 값: 위험한 색 · 없는 글꼴 · javascript: 이미지 · 없는 테마',
    content: {
      v: 1,
      templateId: 'casefile',
      theme: '없는 테마',
      fields: { title: '제목', body: '본문' },
      style: { accent: 'url(javascript:alert(1))', font: 'comic' },
      image: { url: 'javascript:alert(1)', alt: '<script>x</script>' },
    },
  },
  {
    name: '쓸 수 없는 값: 이름 색 · 대문자 글꼴 · http 이미지',
    content: {
      v: 1,
      templateId: 'moonlit',
      theme: 'classic',
      fields: {},
      style: { accent: 'red', font: 'SERIF' },
      image: { url: 'http://insecure.example.com/a.png', alt: 'a' },
    },
  },
  {
    name: '쓸 수 없는 값: 5자리 hex · data: 이미지',
    content: { v: 1, templateId: 'order', fields: { title: 't' }, style: { accent: '#12345' }, image: { url: 'data:image/png;base64,AAAA', alt: '' } },
  },
  {
    name: '쓸 수 없는 값: expression() · 계정 정보가 든 주소',
    content: {
      templateId: 'forest',
      fields: { body: 'b' },
      style: { accent: 'expression(alert(1))' },
      image: { url: 'https://user:pw@example.com/a.png', alt: 'x' },
    },
  },
  {
    name: '쓸 수 없는 값: rgb() 색 · localhost 주소 · 숫자 대체 텍스트',
    content: { templateId: 'moonlit', fields: { title: '' }, style: { accent: 'rgb(1,2,3)' }, image: { url: 'https://localhost/a.png', alt: 7 } },
  },
  {
    name: '알 수 없는 템플릿 · 숫자 테마 · 문자열이 아닌 칸 · 숫자 색 · 숫자 주소',
    content: {
      templateId: 'harbor',
      theme: 7,
      fields: { title: '항구', body: 3, cap: null, signature: true, extra: { nested: 1 }, list: ['a'] },
      style: { accent: 123, font: null },
      image: { url: 5, alt: 'x' },
    },
  },
  {
    name: '객체가 아닌 style · image',
    content: { v: 1, templateId: 'moonlit', theme: 'purple', fields: { title: '제목' }, style: ['x'], image: 'https://example.com/a.png' },
  },
  {
    name: '객체가 아닌 fields (템플릿은 올바름)',
    content: { v: 1, templateId: 'order', theme: 'royal', fields: 'nope', style: 'x', image: [] },
  },
  {
    name: 'JSON 에서 읽은 __proto__ · constructor 키',
    content: fromJson(
      '{"v":1,"templateId":"moonlit","theme":"dark","fields":{"__proto__":"proto 칸","constructor":"c","title":"제목"},' +
        '"style":{"__proto__":{"accent":"#000000"},"accent":"#DDEEFF"},"image":null,"__proto__":{"polluted":true}}',
    ),
  },
  {
    name: '숨은 칸(다른 템플릿에만 있는 칸) · 아주 긴 칸',
    content: {
      v: 1,
      templateId: 'moonlit',
      theme: 'forest',
      fields: { title: '숨은 칸', body: '가'.repeat(25_000), caseNo: '№ 숨은 번호', motto: '숨은 표어', date: '숨은 날짜', agent: '숨은 담당', seal: '✠' },
      style: { font: 'serif' },
      image: null,
    },
  },
  { name: '버전 표시 없는 핸드아웃', content: { templateId: 'casefile', fields: { title: '버전 없음' } } },
  { name: '문자열 버전 표시', content: { v: '1', templateId: 'order', theme: 'obsidian', fields: { title: '문자열 버전' } } },
  { name: '빈 {} (legacy)', content: {} },
  { name: 'Phase 1 { text } (legacy)', content: { text: '예전 본문\n  들여쓴 줄  \n\n끝 ' } },
  {
    name: 'Phase 1 { text } + 다른 키 · 테마 · 색 · 이미지 (legacy)',
    content: {
      text: '본문',
      note: { from: 'phase1' },
      theme: 'dark',
      style: { accent: '#ABC' },
      image: { url: 'https://EXAMPLE.com/x.png', alt: 'x' },
    },
  },
  { name: '빈 text (legacy)', content: { text: '' } },
  {
    name: '문자열이 아닌 text · 알 수 없는 templateId · 객체가 아닌 fields · 다른 버전 (legacy)',
    content: { text: 5, templateId: 'nope', fields: 'x', v: 3 },
  },
]

/** 고정 시드 의사 난수 (mulberry32) — 실행할 때마다 같은 값이 나온다 */
export function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ABSENT = Symbol('absent')
type Pool = readonly unknown[]

const pools = {
  v: [ABSENT, 1, 1, 2, '1', null],
  templateId: [ABSENT, 'moonlit', 'casefile', 'order', 'forest', 'moonlit', 'casefile', 'nope', 'Moonlit', 3],
  theme: [ABSENT, 'classic', 'dark', 'purple', 'manila', 'midnight', 'crimson', 'royal', 'moss', 'dusk', 'nope', 'DARK', '', 7],
  text: [ABSENT, ABSENT, ABSENT, '', 'Phase 1 본문\n  들여쓴 줄  ', 5],
  fieldKeys: ['cap', 'title', 'body', 'signature', 'caseNo', 'date', 'agent', 'motto', 'seal', 'bad key', 'x'.repeat(30), 'constructor'],
  fieldValues: ['', ' ', '\n', '제목  ', '본문\n  둘째 줄 ', `<b>&"'</b>`, 3, null, true, { nested: 1 }, ['a']],
  accent: [ABSENT, '#ABC', '#a1B2c3', ' #123456 ', 'abc', '#9b3b2f', 'red', 'url(javascript:alert(1))', '#12345', 'expression(alert(1))', 5, null],
  font: [ABSENT, 'serif', 'sans', 'hand', 'comic', 'SERIF', 3],
  url: [
    ABSENT,
    'https://EXAMPLE.com/map.png',
    'HTTPS://cdn.Example.COM/A.PNG',
    ' https://cdn.example.com/map.png ',
    'https://example.com/%7euser/a%2Fb.png',
    'https://example.com/지도.png',
    'https://example.com/a b.png',
    'https://example.com/a.png?q="x"&r=<y>',
    'https://example.com:443/./a/../b.png',
    'https://cdn.example.com/plain.png',
    'http://insecure.example.com/a.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'https://user:pw@example.com/a.png',
    'https://localhost/a.png',
    '',
    5,
  ],
  alt: [ABSENT, '', '지도 <1> & "q"', ' 앞뒤 공백 ', '설'.repeat(250), 7],
  extra: [ABSENT, ABSENT, { nested: [1, 'two', null] }, 'string', 0],
  notObject: ['nope', ['a'], null, 3],
} satisfies Record<string, Pool>

/** 무작위 저장 content: 키마다 올바른 값 · 정규화하면 바뀌는 값 · 쓸 수 없는 값 · 없음 가운데 하나 */
export function randomStored(rand: () => number): DocumentContent {
  const pick = (pool: Pool) => pool[Math.floor(rand() * pool.length)]
  const chance = (p: number) => rand() < p
  const doc: Record<string, unknown> = {}
  const put = (target: Record<string, unknown>, key: string, pool: Pool) => {
    const value = pick(pool)
    if (value !== ABSENT) target[key] = value
  }

  put(doc, 'v', pools.v)
  put(doc, 'templateId', pools.templateId)
  put(doc, 'theme', pools.theme)
  put(doc, 'text', pools.text)
  if (chance(0.75)) {
    const fields: Record<string, unknown> = {}
    for (const key of pools.fieldKeys) if (chance(0.45)) fields[key] = pick(pools.fieldValues)
    doc.fields = fields
  } else if (chance(0.5)) doc.fields = pick(pools.notObject)
  if (chance(0.7)) {
    const style: Record<string, unknown> = {}
    put(style, 'accent', pools.accent)
    put(style, 'font', pools.font)
    if (chance(0.2)) style.weight = 'bold'
    doc.style = style
  } else if (chance(0.4)) doc.style = pick(pools.notObject)
  if (chance(0.6)) {
    const image: Record<string, unknown> = {}
    put(image, 'url', pools.url)
    put(image, 'alt', pools.alt)
    if (chance(0.2)) image.caption = '캡션'
    doc.image = image
  } else if (chance(0.5)) doc.image = chance(0.5) ? null : pick(pools.notObject)
  put(doc, 'extra', pools.extra)
  // 서버에서 온 것처럼 JSON 으로 한 번 오간 값
  return JSON.parse(JSON.stringify(doc)) as DocumentContent
}

/** 같은 시드로 늘 같은 무작위 content 묶음 */
export function randomCorpus(count: number, seed = 20261125): StoredCase[] {
  const rand = seededRandom(seed)
  return Array.from({ length: count }, (_, i) => ({ name: `무작위 #${i}`, content: randomStored(rand) }))
}
