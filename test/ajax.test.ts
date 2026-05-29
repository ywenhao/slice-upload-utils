import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ajaxRequest, AjaxRequestError, type RequestProgressEvent } from '../src'
import { FakeXMLHttpRequest } from './helpers'

describe('ajaxRequest', () => {
  beforeEach(() => {
    FakeXMLHttpRequest.reset()
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
  })

  it('serializes GET query data and parses JSON responses', async () => {
    FakeXMLHttpRequest.reset({ autoLoad: true, responseText: '{"ok":true}' })
    const success = vi.fn<(response: unknown) => void>()

    ajaxRequest({
      url: '/api',
      method: 'GET',
      data: { a: 1, b: null, c: 'x' } as any,
      onError: vi.fn<(evt: AjaxRequestError) => void>(),
      onSuccess: success,
      withCredentials: false,
    }).request()

    expect(FakeXMLHttpRequest.instances[0]!.url).toBe('/api?a=1&c=x')
    expect(FakeXMLHttpRequest.instances[0]!.body).toBeNull()
    expect(success).toHaveBeenCalledWith({ ok: true })
  })

  it('serializes object bodies as JSON and keeps FormData untouched', () => {
    const jsonSuccess = vi.fn<(response: unknown) => void>()
    ajaxRequest({
      url: '/json',
      method: 'POST',
      data: { a: 1 } as any,
      onError: vi.fn<(evt: AjaxRequestError) => void>(),
      onSuccess: jsonSuccess,
      withCredentials: true,
    }).request()

    const jsonXhr = FakeXMLHttpRequest.instances[0]!
    expect(jsonXhr.body).toBe('{"a":1}')
    expect(jsonXhr.withCredentials).toBe(true)
    expect(jsonXhr.requestHeaders['Content-Type']).toBe('application/json;charset=utf-8')

    const form = new FormData()
    form.append('file', 'content')
    ajaxRequest({
      url: '/form',
      method: 'POST',
      data: form,
      headers: { 'X-Test': 'yes' },
      onError: vi.fn<(evt: AjaxRequestError) => void>(),
      onSuccess: vi.fn<(response: unknown) => void>(),
      withCredentials: false,
    }).request()

    const formXhr = FakeXMLHttpRequest.instances[1]!
    expect(formXhr.body).toBe(form)
    expect(formXhr.requestHeaders['X-Test']).toBe('yes')
    expect(formXhr.requestHeaders['Content-Type']).toBeUndefined()
  })

  it('reports upload and download progress percentages', () => {
    const uploadProgress = vi.fn<(evt: RequestProgressEvent) => void>()
    const downloadProgress = vi.fn<(evt: RequestProgressEvent) => void>()

    const xhr = ajaxRequest({
      url: '/progress',
      method: 'POST',
      onDownloadProgress: downloadProgress,
      onError: vi.fn<(evt: AjaxRequestError) => void>(),
      onSuccess: vi.fn<(response: unknown) => void>(),
      onUploadProgress: uploadProgress,
      withCredentials: false,
    })
    xhr.request()

    const fake = FakeXMLHttpRequest.instances[0]!
    fake.uploadProgress(3, 6)
    fake.progress(5, 10)

    expect(uploadProgress.mock.calls[0]![0].percent).toBe(50)
    expect(downloadProgress.mock.calls[0]![0].percent).toBe(50)
  })

  it('returns AjaxRequestError for non-2xx load, network error, abort, and timeout', () => {
    const loadError = vi.fn<(evt: AjaxRequestError) => void>()
    const xhr = ajaxRequest({
      url: '/fail',
      method: 'GET',
      onError: loadError,
      onSuccess: vi.fn<(response: unknown) => void>(),
      withCredentials: false,
    })
    xhr.request()
    FakeXMLHttpRequest.instances[0]!.status = 500
    FakeXMLHttpRequest.instances[0]!.responseText = 'server fail'
    FakeXMLHttpRequest.instances[0]!.load()

    expect(loadError).toHaveBeenCalledWith(expect.any(AjaxRequestError))
    expect(loadError.mock.calls[0]![0].message).toBe('server fail')

    const networkError = vi.fn<(evt: AjaxRequestError) => void>()
    ajaxRequest({
      url: '/network',
      method: 'GET',
      onError: networkError,
      onSuccess: vi.fn<(response: unknown) => void>(),
      withCredentials: false,
    }).request()
    FakeXMLHttpRequest.instances[1]!.status = 0
    FakeXMLHttpRequest.instances[1]!.error()
    expect(networkError).toHaveBeenCalledWith(expect.any(AjaxRequestError))

    const abort = vi.fn<(evt: AjaxRequestError) => void>()
    ajaxRequest({
      url: '/abort',
      method: 'GET',
      onAbort: abort,
      onError: vi.fn<(evt: AjaxRequestError) => void>(),
      onSuccess: vi.fn<(response: unknown) => void>(),
      withCredentials: false,
    }).request()
    FakeXMLHttpRequest.instances[2]!.abort()
    expect(abort).toHaveBeenCalledWith(expect.any(AjaxRequestError))

    const timeout = vi.fn<(evt: AjaxRequestError) => void>()
    ajaxRequest({
      url: '/timeout',
      method: 'GET',
      onError: timeout,
      onSuccess: vi.fn<(response: unknown) => void>(),
      timeout: 10,
      withCredentials: false,
    }).request()
    FakeXMLHttpRequest.instances[3]!.triggerTimeout()
    expect(timeout).toHaveBeenCalledWith(expect.any(AjaxRequestError))
  })
})
