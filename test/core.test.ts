import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AjaxRequestError,
  SliceDownload,
  SliceUpload,
  defineSliceDownload,
  defineSliceUpload,
  getCustomChunkHash,
  getFileHash,
  getHashChunks,
  getPreFile,
  mergeFile,
  saveFile,
} from '../src'
import type { DownloadFinishParams, UploadFinishParams, UploadRequest } from '../src'
import { promisePool } from '../src/utils/pool'
import { createFile, FakeXMLHttpRequest, sleep, stubUrl, waitFor } from './helpers'

describe('exports', () => {
  it('exports core classes and factories', () => {
    expect(SliceUpload).toBeTypeOf('function')
    expect(SliceDownload).toBeTypeOf('function')
    expect(defineSliceUpload).toBeTypeOf('function')
    expect(defineSliceDownload).toBeTypeOf('function')
  })
})

describe('promisePool', () => {
  it('waits for the last running batch before resolving', async () => {
    const done: number[] = []

    await promisePool({
      limit: 2,
      promiseList: [
        async () => {
          await sleep(5)
          done.push(1)
        },
        async () => {
          await sleep(1)
          done.push(2)
        },
        async () => {
          await sleep(1)
          done.push(3)
        },
      ],
    })

    expect(done.sort()).toEqual([1, 2, 3])
  })

  it('stops scheduling new tasks when beStop returns true', async () => {
    const done: number[] = []

    await promisePool({
      limit: 1,
      beStop: () => done.length === 1,
      promiseList: [async () => done.push(1), async () => done.push(2)],
    })

    expect(done).toEqual([1])
  })
})

describe('hash and chunk helpers', () => {
  it('uses the original file as the pre-file for small files', () => {
    const file = createFile('abc')

    expect(getPreFile(file, 10)).toBe(file)
  })

  it('creates deterministic custom chunk hashes', () => {
    expect(getCustomChunkHash('file-hash', 2, 1)).toBe(getCustomChunkHash('file-hash', 2, 1))
    expect(getCustomChunkHash('file-hash', 2, 1)).not.toBe(getCustomChunkHash('file-hash', 2, 2))
  })

  it('hashes files incrementally instead of reading the whole file at once', async () => {
    const file = createFile('abcdef')
    const readChunks: string[] = []
    const originalSlice = file.slice.bind(file)
    const slice = vi.spyOn(file, 'slice').mockImplementation((start, end, contentType) => {
      const chunk = originalSlice(start, end, contentType)
      readChunks.push(`${start}-${end}`)
      return chunk
    })

    const hash = await getFileHash(file, 2)

    expect(hash).toMatch(/^[a-f0-9]{32}$/)
    expect(slice).toHaveBeenCalledTimes(3)
    expect(readChunks).toEqual(['0-2', '2-4', '4-6'])
  })

  it('chunks small files without using worker paths', async () => {
    const file = createFile('abcd')
    const result = await getHashChunks({
      file,
      chunkSize: 10,
      realChunkHash: false,
      realPreHash: false,
    })

    expect(result.fileChunks).toHaveLength(1)
    expect(result.fileChunks[0]!.chunk).toBe(file)
    expect(result.fileChunks[0]!.chunkHash).toBe(result.preHash)
  })

  it('does not read every chunk body when default custom chunk hashes are enough', async () => {
    const file = createFile('abcdef')
    const originalSlice = file.slice.bind(file)
    const read = vi.fn<() => Promise<ArrayBuffer>>()
    vi.spyOn(file, 'slice').mockImplementation((start, end, contentType) => {
      const chunk = originalSlice(start, end, contentType)
      vi.spyOn(chunk, 'arrayBuffer').mockImplementation(async () => {
        read()
        return await Blob.prototype.arrayBuffer.call(chunk)
      })
      return chunk
    })

    const result = await getHashChunks({
      file,
      chunkSize: 2,
      realChunkHash: false,
      realPreHash: false,
    })

    expect(result.fileChunks.map((chunk) => chunk.chunkHash)).toEqual(
      result.fileChunks.map((_, index) => getCustomChunkHash(result.preHash, 2, index)),
    )
    expect(read).not.toHaveBeenCalled()
  })

  it('computes each real chunk hash independently', async () => {
    const file = createFile('abcdef')
    const result = await getHashChunks({
      file,
      chunkSize: 2,
      realChunkHash: true,
      realPreHash: false,
    })

    expect(result.fileChunks.map((chunk) => chunk.chunkHash)).toEqual([
      await getFileHash(new Blob(['ab'])),
      await getFileHash(new Blob(['cd'])),
      await getFileHash(new Blob(['ef'])),
    ])
  })
})

describe('SliceUpload', () => {
  it('uploads chunks and exposes ajaxRequest as a non-enumerable helper', async () => {
    const file = createFile('abcdef')
    const upload = defineSliceUpload({ file, chunkSize: 2, poolCount: 2 })
    const seenIndexes: number[] = []
    const progress: number[] = []
    const finish = vi.fn<(params: UploadFinishParams) => void>()

    upload.on('progress', (event) => progress.push(event.progress))
    upload.on('finish', finish)
    upload.setUploadRequest(async (params) => {
      seenIndexes.push(params.index)
      expect(Object.keys(params)).not.toContain('ajaxRequest')
    })

    await upload.start()

    expect(seenIndexes.sort()).toEqual([0, 1, 2])
    expect(upload.status).toBe('success')
    expect(upload.progress).toBe(100)
    expect(progress.at(-1)).toBe(100)
    expect(finish).toHaveBeenCalledOnce()
  })

  it('marks pre-verified chunks as success and only uploads missing chunks', async () => {
    const file = createFile('abcdef')
    const upload = defineSliceUpload({ file, chunkSize: 2, poolCount: 1 })
    const uploaded: number[] = []

    upload.setPreVerifyRequest(async () => {
      const { chunks } = upload.getData()
      return [chunks[0]!.chunkHash, chunks[2]!.chunkHash]
    })
    upload.setUploadRequest(async (params) => {
      uploaded.push(params.index)
    })

    await upload.start()

    expect(uploaded).toEqual([1])
    expect(upload.status).toBe('success')
    expect(upload.getData().chunks.every((chunk) => chunk.progress === 100)).toBe(true)
  })

  it('keeps duplicate real chunk hashes bound to their own indexes', async () => {
    FakeXMLHttpRequest.reset()
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    const file = createFile('abab')
    const upload = defineSliceUpload({ file, chunkSize: 2, poolCount: 1, realChunkHash: true })
    const uploaded: number[] = []

    upload.setPreVerifyRequest(async () => {
      const { chunks } = upload.getData()
      return [chunks[0]!.chunkHash]
    })
    upload.setUploadRequest(async (params) => {
      uploaded.push(params.index)
      await params.ajaxRequest({ url: `/upload-${params.index}` })
    })

    const start = upload.start()
    await waitFor(() => expect(FakeXMLHttpRequest.instances[0]).toBeDefined())
    const xhr = FakeXMLHttpRequest.instances[0]!
    xhr.status = 200
    xhr.responseText = 'ok'
    xhr.uploadProgress(1, 1)
    xhr.load()
    await start

    expect(uploaded).toEqual([1])
    expect(upload.status).toBe('success')
    expect(upload.getData().chunks.map((chunk) => chunk.progress)).toEqual([100, 100])
  })

  it('treats preVerify true as a complete upload', async () => {
    const file = createFile('abcdef')
    const upload = defineSliceUpload({ file, chunkSize: 2 })
    const request = vi.fn<UploadRequest>()
    const finish = vi.fn<(params: UploadFinishParams) => void>()

    upload.on('finish', finish)
    upload.setPreVerifyRequest(async () => true)
    upload.setUploadRequest(request)

    await upload.start()

    expect(request).not.toHaveBeenCalled()
    expect(upload.status).toBe('success')
    expect(finish).toHaveBeenCalled()
  })

  it('emits an AjaxRequestError when a chunk request returns false', async () => {
    const file = createFile('abcd')
    const upload = defineSliceUpload({ file, chunkSize: 2 })
    const error = vi.fn<(error: unknown) => void>()

    upload.on('error', error)
    upload.setUploadRequest(async (params) => params.index !== 1)

    await upload.start()

    expect(upload.status).toBe('error')
    expect(error).toHaveBeenCalledWith(expect.any(AjaxRequestError))
  })

  it('validates required file and request before starting', async () => {
    await expect(defineSliceUpload().start()).rejects.toThrow('file is required')
    await expect(defineSliceUpload({ file: createFile('') }).start()).rejects.toThrow(
      'uploadRequestInstance is required',
    )
  })

  it('pauses an in-flight upload and resets requestable chunks on cancel', async () => {
    FakeXMLHttpRequest.reset()
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    const upload = defineSliceUpload({ file: createFile('abcd'), chunkSize: 2, poolCount: 1 })
    const pause = vi.fn<() => void>()

    upload.on('pause', pause)
    upload.setUploadRequest((params) => params.ajaxRequest({ url: '/upload' }))

    const start = upload.start()
    await waitFor(() => expect(FakeXMLHttpRequest.instances[0]).toBeDefined())
    await waitFor(() => expect(upload.status).toBe('uploading'))
    FakeXMLHttpRequest.instances[0]!.uploadProgress(1, 2)
    upload.pause()
    await start

    expect(pause).toHaveBeenCalledOnce()
    expect(upload.status).toBe('pause')
    expect(upload.getData().chunks[0]!.status).toBe('pause')

    upload.cancel()

    expect(upload.status).toBe('cancel')
    expect(upload.progress).toBe(0)
    expect(upload.getData().chunks.every((chunk) => chunk.progress === 0)).toBe(true)
  })

  it('does not hang when upload is canceled before a delayed ajaxRequest starts', async () => {
    FakeXMLHttpRequest.reset()
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    const upload = defineSliceUpload({ file: createFile('abcd'), chunkSize: 2, poolCount: 1 })

    upload.setUploadRequest(async (params) => {
      await sleep(5)
      return await params.ajaxRequest({ url: '/late-upload' })
    })

    const start = upload.start()
    await waitFor(() => expect(upload.getData().chunks.length).toBe(2))
    upload.cancel()
    await start

    expect(FakeXMLHttpRequest.instances).toHaveLength(0)
    expect(upload.status).toBe('cancel')
  })

  it('does not hang when upload is canceled while waiting to retry', async () => {
    FakeXMLHttpRequest.reset()
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    const upload = defineSliceUpload({
      chunkSize: 2,
      file: createFile('ab'),
      retryCount: 1,
      retryDelay: 5,
    })

    upload.setUploadRequest((params) => params.ajaxRequest({ url: '/retry-upload' }))

    const start = upload.start()
    await waitFor(() => expect(FakeXMLHttpRequest.instances[0]).toBeDefined())
    FakeXMLHttpRequest.instances[0]!.error()
    upload.cancel()
    await start

    expect(upload.status).toBe('cancel')
  })
})

describe('SliceDownload', () => {
  beforeEach(() => {
    stubUrl()
  })

  it('downloads chunks, merges them, and emits finish', async () => {
    const download = defineSliceDownload({
      autoSave: false,
      chunkSize: 2,
      fileSize: 5,
      filename: 'out.txt',
      fileType: 'text/plain',
      poolCount: 2,
    })
    const finish = vi.fn<(params: DownloadFinishParams) => void>()

    download.on('finish', finish)
    download.setDownloadRequest(async (params) => {
      expect(Object.keys(params)).not.toContain('ajaxRequest')
      const content = ['ab', 'cd', 'e'][params.index]
      return new Blob([content!], { type: params.fileType })
    })

    await download.start()

    expect(download.status).toBe('success')
    expect(download.progress).toBe(100)
    expect(finish).toHaveBeenCalledOnce()
    const file = finish.mock.calls[0]![0].file as File
    expect(file.name).toBe('out.txt')
    expect(await file.text()).toBe('abcde')
  })

  it('resets chunks when canceled', async () => {
    const download = defineSliceDownload({
      autoSave: false,
      chunkSize: 2,
      fileSize: 4,
      filename: 'out.txt',
    })
    download.setDownloadRequest(async () => new Blob(['ok']))

    await download.start()
    download.cancel()

    expect(download.status).toBe('cancel')
    expect(download.progress).toBe(0)
    expect(download.getData().chunks.every((chunk) => chunk.progress === 0)).toBe(true)
  })

  it('updates file options before starting', async () => {
    const download = defineSliceDownload({ autoSave: false })
    download.setDownloadRequest(async () => new Blob(['ok']))

    download.setFileOptions({ filename: 'later.txt', fileSize: 2, fileType: 'text/plain' })
    await download.start()

    expect(download.status).toBe('success')
  })

  it('resets finished chunks when download file options change', async () => {
    const download = defineSliceDownload({
      autoSave: false,
      chunkSize: 2,
      fileSize: 2,
      filename: 'first.txt',
    })
    const seen: string[] = []

    download.setDownloadRequest(async (params) => {
      seen.push(params.filename)
      return new Blob([params.filename])
    })

    await download.start()
    download.setFileOptions({ filename: 'second.txt', fileSize: 4 })
    await download.start()

    expect(seen).toEqual(['first.txt', 'second.txt', 'second.txt'])
    expect(download.status).toBe('success')
    expect(download.getData().chunks).toHaveLength(2)
  })

  it('validates required download options before starting', async () => {
    await expect(defineSliceDownload({}).start()).rejects.toThrow('filename is required')

    const missingSize = defineSliceDownload({ filename: 'a.txt' })
    missingSize.setDownloadRequest(async () => new Blob(['ok']))
    await expect(missingSize.start()).rejects.toThrow('fileSize is required')

    await expect(defineSliceDownload({ filename: 'a.txt', fileSize: 1 }).start()).rejects.toThrow(
      'downloadRequestInstance is required',
    )
  })

  it('pauses an in-flight download and reports paused chunk state', async () => {
    FakeXMLHttpRequest.reset()
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    const download = defineSliceDownload({
      autoSave: false,
      chunkSize: 2,
      fileSize: 4,
      filename: 'out.txt',
      poolCount: 1,
    })
    const pause = vi.fn<() => void>()

    download.on('pause', pause)
    download.setDownloadRequest((params) => params.ajaxRequest({ url: '/download' }))

    const start = download.start()
    await waitFor(() => expect(FakeXMLHttpRequest.instances[0]).toBeDefined())
    await waitFor(() => expect(download.status).toBe('downloading'))
    FakeXMLHttpRequest.instances[0]!.progress(1, 2)
    download.pause()
    await start

    expect(pause).toHaveBeenCalledOnce()
    expect(download.status).toBe('pause')
    expect(download.getData().chunks[0]!.status).toBe('pause')
  })

  it('does not hang when download is canceled before a delayed ajaxRequest starts', async () => {
    FakeXMLHttpRequest.reset()
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    const download = defineSliceDownload({
      autoSave: false,
      chunkSize: 2,
      fileSize: 2,
      filename: 'out.txt',
    })

    download.setDownloadRequest(async (params) => {
      await sleep(5)
      return await params.ajaxRequest({ url: '/late-download' })
    })

    const start = download.start()
    await waitFor(() => expect(download.getData().chunks.length).toBe(1))
    download.cancel()
    await start

    expect(FakeXMLHttpRequest.instances).toHaveLength(0)
    expect(download.status).toBe('cancel')
  })

  it('does not hang when download is canceled while waiting to retry', async () => {
    FakeXMLHttpRequest.reset()
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
    const download = defineSliceDownload({
      autoSave: false,
      fileSize: 2,
      filename: 'out.txt',
      retryCount: 1,
      retryDelay: 5,
    })

    download.setDownloadRequest((params) => params.ajaxRequest({ url: '/retry-download' }))

    const start = download.start()
    await waitFor(() => expect(FakeXMLHttpRequest.instances[0]).toBeDefined())
    FakeXMLHttpRequest.instances[0]!.error()
    download.cancel()
    await start

    expect(download.status).toBe('cancel')
  })

  it('marks a chunk as error when request does not return a Blob', async () => {
    const download = defineSliceDownload({
      autoSave: false,
      fileSize: 2,
      filename: 'out.txt',
    })
    const error = vi.fn<(error: unknown) => void>()

    download.on('error', error)
    download.setDownloadRequest(async () => false)
    await download.start()

    expect(download.status).toBe('error')
    expect(error).toHaveBeenCalledWith(expect.any(AjaxRequestError))
  })
})

describe('file helpers', () => {
  beforeEach(() => {
    stubUrl()
  })

  it('keeps filename, type, and content order when merging', async () => {
    const file = mergeFile([new Blob(['a']), new Blob(['b'])], 'merged.txt', 'text/plain')

    expect(file.name).toBe('merged.txt')
    expect(file.type).toBe('text/plain')
    expect(await file.text()).toBe('ab')
  })

  it('saves files through an anchor download', () => {
    const click = vi.fn<() => void>()
    const remove = vi.fn<() => void>()
    const anchor = {
      click,
      download: '',
      href: '',
      remove,
    } as unknown as HTMLAnchorElement
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    saveFile(new Blob(['a']), 'a.txt')

    expect(createElement).toHaveBeenCalledWith('a')
    expect(anchor.download).toBe('a.txt')
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})
