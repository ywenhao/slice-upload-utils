import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AjaxRequestError,
  SliceDownload,
  SliceUpload,
  defineSliceDownload,
  defineSliceUpload,
  mergeFile,
} from '../src'
import type { DownloadFinishParams, UploadFinishParams } from '../src'
import { promisePool } from '../src/utils/pool'

function createFile(content: string, name = 'demo.txt', type = 'text/plain') {
  return new File([content], name, { type })
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
})

describe('SliceUpload', () => {
  it('uploads chunks and exposes ajaxRequest as a non-enumerable helper', async () => {
    const file = createFile('abcdef')
    const upload = defineSliceUpload({ file, chunkSize: 2, poolCount: 2 })
    const seenIndexes: number[] = []
    const progress: number[] = []
    const finish = vi.fn<[UploadFinishParams], void>()

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

  it('emits an AjaxRequestError when a chunk request returns false', async () => {
    const file = createFile('abcd')
    const upload = defineSliceUpload({ file, chunkSize: 2 })
    const error = vi.fn<[unknown], void>()

    upload.on('error', error)
    upload.setUploadRequest(async (params) => params.index !== 1)

    await upload.start()

    expect(upload.status).toBe('error')
    expect(error).toHaveBeenCalledWith(expect.any(AjaxRequestError))
  })
})

describe('SliceDownload', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn<[Blob | MediaSource], string>(() => 'blob:test'),
      revokeObjectURL: vi.fn<[string], void>(),
    })
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
    const finish = vi.fn<[DownloadFinishParams], void>()

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
})

describe('mergeFile', () => {
  it('keeps filename, type, and content order', async () => {
    const file = mergeFile([new Blob(['a']), new Blob(['b'])], 'merged.txt', 'text/plain')

    expect(file.name).toBe('merged.txt')
    expect(file.type).toBe('text/plain')
    expect(await file.text()).toBe('ab')
  })
})
