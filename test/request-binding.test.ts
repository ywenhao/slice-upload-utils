import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineSliceDownload, defineSliceUpload } from '../src'
import { createFile, FakeXMLHttpRequest, sleep, waitFor } from './helpers'

describe('chunk-bound ajaxRequest helpers', () => {
  beforeEach(() => {
    FakeXMLHttpRequest.reset()
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('binds upload ajax requests to the originating chunk across awaits', async () => {
    const upload = defineSliceUpload({ file: createFile('abcdef'), chunkSize: 2, poolCount: 3 })

    upload.setUploadRequest(async (params) => {
      if (params.index === 0) await sleep(5)
      const result = params.ajaxRequest<string>({ url: `/chunk-${params.index}` })
      await waitFor(() =>
        expect(
          FakeXMLHttpRequest.instances.some((xhr) => xhr.url === `/chunk-${params.index}`),
        ).toBe(true),
      )
      const xhr = FakeXMLHttpRequest.instances.find(
        (item) => item.url === `/chunk-${params.index}`,
      )!
      xhr.status = 200
      xhr.responseText = `ok-${params.index}`
      xhr.uploadProgress(1, 1)
      xhr.load()
      await result
    })

    await upload.start()

    expect(FakeXMLHttpRequest.instances.map((xhr) => xhr.url).sort()).toEqual([
      '/chunk-0',
      '/chunk-1',
      '/chunk-2',
    ])
    expect(upload.status).toBe('success')
  })

  it('binds download ajax requests to the originating chunk and sends Range headers', async () => {
    const download = defineSliceDownload({
      autoSave: false,
      chunkSize: 2,
      fileSize: 5,
      filename: 'out.txt',
      poolCount: 3,
    })

    download.setDownloadRequest(async (params) => {
      if (params.index === 0) await sleep(5)
      const result = params.ajaxRequest<Blob>({ url: `/chunk-${params.index}` })
      await waitFor(() =>
        expect(
          FakeXMLHttpRequest.instances.some((xhr) => xhr.url === `/chunk-${params.index}`),
        ).toBe(true),
      )
      const xhr = FakeXMLHttpRequest.instances.find(
        (item) => item.url === `/chunk-${params.index}`,
      )!
      xhr.status = 200
      xhr.response = new Blob([String(params.index)])
      xhr.progress(1, 1)
      xhr.load()
      return await result
    })

    await download.start()

    expect(FakeXMLHttpRequest.instances.map((xhr) => xhr.url).sort()).toEqual([
      '/chunk-0',
      '/chunk-1',
      '/chunk-2',
    ])
    expect(rangeFor('/chunk-0')).toBe('bytes=0-1')
    expect(rangeFor('/chunk-1')).toBe('bytes=2-3')
    expect(rangeFor('/chunk-2')).toBe('bytes=4-4')
    expect(download.status).toBe('success')
  })

  it('preserves custom Headers when adding download Range headers', async () => {
    const download = defineSliceDownload({
      autoSave: false,
      chunkSize: 2,
      fileSize: 2,
      filename: 'out.txt',
    })

    download.setDownloadRequest(async (params) => {
      const result = params.ajaxRequest<Blob>({
        headers: new Headers({ Authorization: 'Bearer token' }),
        url: '/with-headers',
      })
      await waitFor(() => expect(FakeXMLHttpRequest.instances[0]).toBeDefined())
      const xhr = FakeXMLHttpRequest.instances[0]!
      xhr.status = 200
      xhr.response = new Blob(['ok'])
      xhr.progress(1, 1)
      xhr.load()
      return await result
    })

    await download.start()

    expect(FakeXMLHttpRequest.instances[0]!.requestHeaders.Authorization).toBe('Bearer token')
    expect(FakeXMLHttpRequest.instances[0]!.requestHeaders.Range).toBe('bytes=0-1')
  })

  it('aborts active upload and download XHRs when paused or canceled', async () => {
    const upload = defineSliceUpload({ file: createFile('abcd'), chunkSize: 2, poolCount: 1 })
    upload.setUploadRequest((params) => params.ajaxRequest({ url: '/upload' }))

    const uploadStart = upload.start()
    await waitFor(() => expect(FakeXMLHttpRequest.instances[0]).toBeDefined())
    const uploadAbort = vi.spyOn(FakeXMLHttpRequest.instances[0]!, 'abort')
    upload.pause()
    await uploadStart
    expect(uploadAbort).toHaveBeenCalled()
    expect(upload.status).toBe('pause')

    FakeXMLHttpRequest.reset()
    const download = defineSliceDownload({
      autoSave: false,
      chunkSize: 2,
      fileSize: 2,
      filename: 'out.txt',
    })
    download.setDownloadRequest((params) => params.ajaxRequest({ url: '/download' }))

    const downloadStart = download.start()
    await waitFor(() => expect(FakeXMLHttpRequest.instances[0]).toBeDefined())
    const downloadAbort = vi.spyOn(FakeXMLHttpRequest.instances[0]!, 'abort')
    download.cancel()
    await downloadStart
    expect(downloadAbort).toHaveBeenCalled()
    expect(download.status).toBe('cancel')
  })

  function rangeFor(url: string) {
    return FakeXMLHttpRequest.instances.find((xhr) => xhr.url === url)?.requestHeaders.Range
  }
})
