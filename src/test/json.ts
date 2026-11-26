function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function walk(before: unknown, after: unknown, path: string, out: string[]) {
  if (isPlainObject(before) && isPlainObject(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const sub = path ? `${path}.${key}` : key
      if (Object.hasOwn(before, key) !== Object.hasOwn(after, key)) out.push(sub)
      else walk(before[key], after[key], sub, out)
    }
    return
  }
  // 객체가 아닌 값(문자열 · 숫자 · 배열 · null)은 JSON 문자열로 한 글자씩 비교한다
  if (JSON.stringify(before) !== JSON.stringify(after)) out.push(path || '(root)')
}

/**
 * 두 JSON 값에서 달라진 경로 목록 (정렬). 양쪽 모두 객체인 곳은 키마다 들어가 비교하고,
 * 그 밖의 값은 JSON 문자열로 비교한다(대소문자 · 공백 · 숫자/문자열 차이도 달라진 것). 생기거나 없어진 키도 달라진 경로다.
 * 예: changedPaths({ a: { b: 1, c: 2 } }, { a: { b: 1, c: 3 }, d: 0 }) → ['a.c', 'd']
 */
export function changedPaths(before: unknown, after: unknown): string[] {
  const out: string[] = []
  walk(before, after, '', out)
  return out.sort()
}

/** 값을 통째로 얼린다 — 테스트에서 저장된 원본을 어디서든 고치려 하면(strict mode) 바로 오류가 나게 */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}
