import { vi } from 'vitest'

export function createFile(content: string, name = 'demo.txt', type = 'text/plain') {
  return new File([content], name, { type })
}

export function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitFor(assertion: () => void | Promise<void>, timeout = 1000) {
  const start = Date.now()
  let lastError: unknown

  while (Date.now() - start < timeout) {
    try {
      await assertion()
      return
    } catch (error) {
      lastError = error
      await sleep(5)
    }
  }

  if (lastError) throw lastError
  throw new Error('waitFor timed out')
}

export function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

export function stubUrl() {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn<[Blob | MediaSource], string>(() => 'blob:test'),
    revokeObjectURL: vi.fn<[string], void>(),
  })
}

type Listener = (event: ProgressEvent) => void

interface FakeXMLHttpRequestConfig {
  response?: unknown
  responseText?: string
  status?: number
  autoLoad?: boolean
}

export class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = []
  static config: FakeXMLHttpRequestConfig = {}

  method = ''
  url = ''
  async = true
  body: XMLHttpRequestBodyInit | null = null
  requestHeaders: Record<string, string> = {}
  response: unknown = undefined
  responseText = ''
  responseType: XMLHttpRequestResponseType = ''
  status = 200
  timeout = 0
  withCredentials = false
  ontimeout: (() => void) | null = null
  upload = new FakeEventTarget()

  private listeners = new Map<string, Listener[]>()

  constructor() {
    FakeXMLHttpRequest.instances.push(this)
  }

  static reset(config: FakeXMLHttpRequestConfig = {}) {
    FakeXMLHttpRequest.instances = []
    FakeXMLHttpRequest.config = config
  }

  open(method: string, url: string, async = true) {
    this.method = method
    this.url = url
    this.async = async
  }

  setRequestHeader(key: string, value: string) {
    this.requestHeaders[key] = value
  }

  send(body: XMLHttpRequestBodyInit | null) {
    this.body = body
    this.status = FakeXMLHttpRequest.config.status ?? this.status
    this.response = FakeXMLHttpRequest.config.response ?? this.response
    this.responseText = FakeXMLHttpRequest.config.responseText ?? this.responseText
    this.dispatch('loadstart')
    this.dispatch('readystatechange')
    if (FakeXMLHttpRequest.config.autoLoad) this.load()
  }

  abort() {
    this.dispatch('abort')
  }

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) || []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  progress(loaded: number, total: number) {
    this.dispatch('progress', createProgressEvent(loaded, total))
  }

  uploadProgress(loaded: number, total: number) {
    this.upload.dispatch('progress', createProgressEvent(loaded, total))
  }

  load() {
    this.dispatch('load')
  }

  error() {
    this.dispatch('error')
  }

  triggerTimeout() {
    this.ontimeout?.()
  }

  private dispatch(type: string, event = createProgressEvent(0, 0)) {
    for (const listener of this.listeners.get(type) || []) listener(event)
  }
}

class FakeEventTarget {
  private listeners = new Map<string, Listener[]>()

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) || []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  dispatch(type: string, event: ProgressEvent) {
    for (const listener of this.listeners.get(type) || []) listener(event)
  }
}

function createProgressEvent(loaded: number, total: number) {
  return { loaded, total } as ProgressEvent
}
