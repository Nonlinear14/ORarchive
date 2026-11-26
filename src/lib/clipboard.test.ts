import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClipboardError, copyRich, copyText } from './clipboard'

/** execCommand('copy') 가 실제 브라우저처럼 copy 이벤트를 보내고, 리스너가 실은 데이터를 기록한다 */
function installExecCommand(result: boolean | 'throw' = true) {
  const written: Record<string, string> = {}
  const exec = vi.fn((command: string) => {
    if (result === 'throw') throw new Error('not supported')
    if (command !== 'copy') return false
    const event = new Event('copy', { cancelable: true }) as Event & { clipboardData: Pick<DataTransfer, 'setData'> }
    event.clipboardData = { setData: (type: string, value: string) => void (written[type] = value) }
    document.dispatchEvent(event)
    return result
  })
  Object.defineProperty(document, 'execCommand', { value: exec, configurable: true, writable: true })
  return { exec, written }
}

class FakeClipboardItem {
  readonly items: Record<string, Blob>
  constructor(items: Record<string, Blob>) {
    this.items = items
  }
}

function installAsyncClipboard(write: (items: FakeClipboardItem[]) => Promise<void>) {
  const spy = vi.fn(write)
  Object.defineProperty(navigator, 'clipboard', { value: { write: spy }, configurable: true })
  vi.stubGlobal('ClipboardItem', FakeClipboardItem)
  return spy
}

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  vi.stubGlobal('ClipboardItem', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  Reflect.deleteProperty(document, 'execCommand')
})

describe('copyRich', () => {
  it('ClipboardItem 이 있으면 text/html + text/plain 을 비동기 API 로 쓴다 (execCommand 안 씀)', async () => {
    const write = installAsyncClipboard(() => Promise.resolve())
    const { exec } = installExecCommand()

    await expect(copyRich('<p>안녕</p>', '안녕')).resolves.toBeUndefined()

    expect(write).toHaveBeenCalledTimes(1)
    const [item] = write.mock.calls[0][0]
    expect(Object.keys(item.items).sort()).toEqual(['text/html', 'text/plain'])
    expect(await item.items['text/html'].text()).toBe('<p>안녕</p>')
    expect(await item.items['text/plain'].text()).toBe('안녕')
    expect(exec).not.toHaveBeenCalled()
  })

  it('API 가 없으면 같은 호출 안에서(동기적으로) execCommand 대체 복사', async () => {
    const { exec, written } = installExecCommand()

    const pending = copyRich('<b>x</b>', 'x')
    // 프라미스를 기다리기 전에 이미 실행됐다 = 클릭의 사용자 활성화 안
    expect(exec).toHaveBeenCalledTimes(1)
    expect(written).toEqual({ 'text/html': '<b>x</b>', 'text/plain': 'x' })
    await expect(pending).resolves.toBeUndefined()
  })

  it('ClipboardItem 생성이 동기적으로 예외를 던지면 바로 대체 복사', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { write: vi.fn() }, configurable: true })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor() {
          throw new TypeError('boom')
        }
      },
    )
    const { exec, written } = installExecCommand()

    const pending = copyRich('<i>y</i>', 'y')
    expect(exec).toHaveBeenCalledTimes(1)
    await expect(pending).resolves.toBeUndefined()
    expect(written['text/html']).toBe('<i>y</i>')
  })

  it('비동기 쓰기가 거부되면 그 뒤에 대체 복사 (동기 호출 안에서는 안 함)', async () => {
    installAsyncClipboard(() => Promise.reject(new DOMException('denied', 'NotAllowedError')))
    const { exec, written } = installExecCommand()

    const pending = copyRich('<p>z</p>', 'z')
    expect(exec).not.toHaveBeenCalled()
    await expect(pending).resolves.toBeUndefined()
    expect(exec).toHaveBeenCalledTimes(1)
    expect(written).toEqual({ 'text/html': '<p>z</p>', 'text/plain': 'z' })
  })

  it('모두 실패하면 ClipboardError 로 reject', async () => {
    installAsyncClipboard(() => Promise.reject(new Error('denied')))
    installExecCommand(false)
    await expect(copyRich('<p>a</p>', 'a')).rejects.toBeInstanceOf(ClipboardError)
  })

  it('API 도 없고 execCommand 도 예외면 reject', async () => {
    installExecCommand('throw')
    await expect(copyRich('<p>a</p>', 'a')).rejects.toBeInstanceOf(ClipboardError)
  })

  it('execCommand 가 true 여도 copy 이벤트에 실리지 않았으면 실패로 본다', async () => {
    const exec = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true, writable: true })
    await expect(copyRich('<p>a</p>', 'a')).rejects.toBeInstanceOf(ClipboardError)
  })
})

describe('copyText', () => {
  it('평문만 쓴다', async () => {
    const write = installAsyncClipboard(() => Promise.resolve())
    await copyText('<!doctype html>')
    const [item] = write.mock.calls[0][0]
    expect(Object.keys(item.items)).toEqual(['text/plain'])
  })
})
