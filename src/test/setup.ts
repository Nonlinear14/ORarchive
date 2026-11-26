import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  // 기기별 화면 설정(최근 조회·테마)은 테스트마다 비운다
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('folio-recent:') || key === 'folio-theme') localStorage.removeItem(key)
  }
  delete document.documentElement.dataset.theme
})
