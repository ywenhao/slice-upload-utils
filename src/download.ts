import type { DownloadEventKey, DownloadEventType, SliceDownloadStatus } from './types'
import type { AjaxRequestOptions, CustomXHR, RequestHeaders } from './utils/ajax'
import { AjaxRequestError, ajaxRequest } from './utils/ajax'
import { Emitter } from './utils/emitter'
import { promisePool } from './utils/pool'
import type { RequestOptions } from './request'

export interface DownloadParams {
  /**
   * Chunk start position, in bytes
   */
  start: number
  /**
   * Chunk end position, in bytes
   */
  end: number
  index: number
  filename: string
  fileType: string
  /**
   * Chunk size, in bytes
   */
  chunkSize: number
  chunkTotal: number
  ajaxRequest: <D = any>(options: RequestOptions) => Promise<D>
}

export interface SetDownloadFileOptions {
  filename?: string
  /**
   * File MIME type
   * @default application/octet-stream
   * @see https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
   */
  fileType?: string
  /**
   * File size, in bytes
   */
  fileSize?: number
}

export type DownloadRequest = (params: DownloadParams) => Promise<false | File | Blob>

export interface SliceDownloadOptions {
  /**
   * File size, in bytes
   */
  fileSize?: number
  filename?: string
  /**
   * File MIME type
   * @default application/octet-stream
   * @see https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
   */
  fileType?: string
  /**
   * Whether to save automatically
   * @default true
   */
  autoSave?: boolean
  /**
   * Chunk size, in bytes
   * @default 1024 * 1024 * 2 bytes
   */
  chunkSize?: number
  /**
   * Concurrent download count
   * @default 3
   */
  poolCount?: number
  /**
   * Retry count after a request fails
   * @default 3
   */
  retryCount?: number
  /**
   * Retry interval after a request fails, in milliseconds
   * @default 300 ms
   */
  retryDelay?: number
  /**
   * Request timeout, in milliseconds
   * @default 15000 ms
   */
  timeout?: number
}

export interface SliceDownloadFileChunk {
  file: Blob | File | null
  index: number
  /**
   * Chunk start position, in bytes
   */
  start: number
  /**
   * Chunk end position, in bytes
   */
  end: number
  status: SliceDownloadStatus
  progress: number
  retryCount: number
}

export class SliceDownload {
  private autoSave: boolean
  private fileType: string
  private filename: string
  private chunkSize: number
  private poolCount: number
  private retryCount: number
  private retryDelay: number
  private timeout: number
  private fileSize = 0

  private isCancel = false
  private isPause = false

  private events = new Emitter()
  private currentRequestChunkIndex = -1
  private sliceFileChunks: SliceDownloadFileChunk[] = []
  private downloadRequestInstance: DownloadRequest | null = null

  private xhr: (CustomXHR | null)[] = []

  constructor(options: SliceDownloadOptions) {
    const {
      filename = '',
      fileSize = 0,
      poolCount = 3,
      retryCount = 3,
      autoSave = true,
      timeout = 15000,
      retryDelay = 300,
      chunkSize = 1024 * 1024 * 2,
      fileType = 'application/octet-stream',
    } = options

    this.autoSave = autoSave
    this.fileType = fileType
    this.fileSize = fileSize
    this.filename = filename
    this.chunkSize = chunkSize
    this.poolCount = poolCount
    this.retryCount = retryCount
    this.retryDelay = retryDelay
    this.timeout = timeout
  }

  setFileOptions(options: SetDownloadFileOptions) {
    const { filename, fileSize, fileType } = options
    const changed =
      (filename !== undefined && filename !== this.filename) ||
      (fileSize !== undefined && fileSize !== this.fileSize) ||
      (fileType !== undefined && fileType !== this.fileType)

    if (changed) this.reset()

    if (filename !== undefined) this.filename = filename
    if (fileSize !== undefined) this.fileSize = fileSize
    if (fileType !== undefined) this.fileType = fileType
    this.check()
  }

  private check() {
    if (!this.filename) throw new Error('filename is required')
    if (!this.fileSize) throw new Error('fileSize is required')
    if (!this.downloadRequestInstance) throw new Error('downloadRequestInstance is required')
  }

  async start() {
    if (['downloading', 'success'].includes(this.status)) return

    this.check()
    this.isCancel = false
    this.isPause = false

    if (!this.sliceFileChunks.length) {
      this.initSliceFileChunks()
      this.emitProgress()
    }

    const _sliceFileChunks = this.sliceFileChunks.filter((v) => v.status !== 'success')
    if (this.sliceFileChunks.length && !_sliceFileChunks.length) {
      this.emitProgress()
      this.emitFinish()
      return
    }

    const failChunks = this.sliceFileChunks.filter((v) => v.status === 'error')
    failChunks.forEach((v) => (v.status = 'ready'))

    this.emit('start')
    this.emitProgress()

    const { promiseList } = this.createPromiseList(_sliceFileChunks)
    return promisePool({
      promiseList,
      limit: this.poolCount,
      beStop: () => this.stop || !this.sliceFileChunks.length,
      resolve: () => {
        this.emitFinish()
      },
    })
  }

  /**
   * Cancel download
   */
  abort() {
    this.xhr.forEach((v) => v && v.abort())
    this.xhr = []
  }

  /**
   * Pause download
   */
  pause() {
    this.isPause = true
    this.abort()
    this.emit('pause')
  }

  /**
   * Cancel download
   */
  cancel() {
    this.isCancel = true
    this.abort()
    this.initSliceFileChunks()
    this.emitProgress()
    this._progress = -1
    this.currentRequestChunkIndex = -1
    this.emit('cancel')
  }

  private createPromiseList(chunks: SliceDownloadFileChunk[]) {
    const beDownloadChunks = chunks.filter((v) => v.status === 'ready')
    const len = beDownloadChunks.length
    const { filename, chunkSize, fileType } = this
    const chunkTotal = this.sliceFileChunks.length
    const promiseList = beDownloadChunks.map((v) => {
      const { start, end, index } = v
      const sliceChunk = this.sliceFileChunks[index]!
      const params = {
        start,
        end,
        index,
        fileType,
        filename,
        chunkSize,
        chunkTotal,
      } as DownloadParams
      Object.defineProperty(params, 'ajaxRequest', {
        enumerable: false,
        value: <D = any>(options: RequestOptions) =>
          this.ajaxRequest<D>({ ...options, chunkIndex: index }),
      })
      return async () => {
        let flag = true
        let error: unknown
        try {
          this.currentRequestChunkIndex = index
          const result = await this.downloadRequestInstance!(params)
          if (result instanceof Blob) {
            sliceChunk.file = result
          } else {
            flag = false
            console.error('downloadRequest must return Blob')
          }
        } catch (e) {
          flag = false
          error = e
        }

        if (this.stop) {
          if (this.currentRequestChunkIndex === index) this.currentRequestChunkIndex = -1
          return false
        }

        if (flag) {
          sliceChunk.status = 'success'
          sliceChunk.retryCount = 0
          sliceChunk.progress = 100
          this.emitProgress()
        } else {
          sliceChunk.status = 'error'
          this.emit(
            'error',
            error ??
              new AjaxRequestError(
                `chunk ${sliceChunk.index} downloaded, request fail`,
                700,
                '',
                '',
              ),
          )
        }

        if (this.currentRequestChunkIndex === index) this.currentRequestChunkIndex = -1
        return flag
      }
    })

    return { promiseList, len }
  }

  ajaxRequest<D = any>(options: RequestOptions) {
    const { timeout } = this

    return new Promise<D>((resolve, reject) => {
      const idx = options.chunkIndex ?? this.currentRequestChunkIndex
      const chunk = this.sliceFileChunks[idx]
      if (!chunk) {
        reject(
          new AjaxRequestError(
            'download chunk is not found',
            700,
            options.method || 'GET',
            options.url,
          ),
        )
        return
      }

      if (this.stop) {
        reject(new AjaxRequestError('download stopped', 0, options.method || 'GET', options.url))
        return
      }

      const retryFn = () => {
        if (this.stop || !this.xhr[idx]) {
          reject(new AjaxRequestError('download stopped', 0, options.method || 'GET', options.url))
          return
        }
        chunk.retryCount++
        this.xhr[idx]!.request()
      }

      const abortFn = () => {
        if (this.stop) this.xhr[idx]?.abort()

        return this.stop
      }
      const { start, end } = chunk
      const headers = mergeRangeHeaders(options.headers, `bytes=${start}-${end}`)

      const ajaxRequestOptions: AjaxRequestOptions = {
        method: 'GET',
        withCredentials: false,
        timeout,
        responseType: 'blob',
        ...options,
        headers,
        readystatechange: () => {
          abortFn()
        },
        onLoadstart: () => {
          chunk.status = 'downloading'
          abortFn()
        },
        onAbort: (evt) => {
          if (chunk.progress !== 100) chunk.status = 'ready'

          // For concurrent downloads, only clear the index if it still points
          // at the current chunk, to avoid overwriting other in-flight chunks.
          if (this.currentRequestChunkIndex === idx) this.currentRequestChunkIndex = -1
          reject(evt)
        },
        onError: (evt) => {
          // retry
          if (chunk.retryCount < this.retryCount) {
            if (this.retryDelay > 0) setTimeout(() => retryFn(), this.retryDelay)
            else retryFn()
            return
          }
          chunk.status = 'error'
          if (this.currentRequestChunkIndex === idx) this.currentRequestChunkIndex = -1
          reject(evt)
        },
        onSuccess: (evt) => {
          resolve(evt)
        },
        onDownloadProgress: (evt) => {
          if (abortFn()) return

          const progress = chunk.progress
          // Prevent the progress bar from going backwards
          if (progress < evt.percent) chunk.progress = evt.percent

          // Cap progress at 99 until the response resolves and the Blob is saved
          if (evt.percent >= 99) chunk.progress = 99

          if (evt.percent !== 100 && !this.stop && chunk.status !== 'error')
            chunk.status = 'downloading'

          this.emitProgress()
        },
      }
      this.xhr[idx] = ajaxRequest(ajaxRequestOptions)
      this.xhr[idx]!.request()
    })
  }

  /**
   * Set the download request function
   * @param request DownloadRequest
   * @returns
   */
  setDownloadRequest(request: DownloadRequest) {
    this.downloadRequestInstance = request
    return this
  }

  private _progress = -1
  emitProgress() {
    const progress = this.progress
    if (progress !== this._progress) {
      this.emit('progress', { progress })
      this._progress = progress
    }
  }

  private emitFinish() {
    if (this.status === 'success') {
      const { filename, chunkSize, fileType } = this
      const chunks = this.sliceFileChunks.map((v) => v.file)
      if (!chunks.every((file): file is Blob | File => file instanceof Blob)) return
      const file = mergeFile(chunks, filename, fileType)
      if (this.autoSave) saveFile(file, filename)
      this.emit('finish', { file, chunkSize, chunkTotal: this.sliceFileChunks.length })
    }
  }

  private initSliceFileChunks(fileChunks?: SliceDownloadFileChunk[]) {
    const reset = { status: 'ready', progress: 0, retryCount: 0 } as const
    if (!fileChunks?.length && !this.sliceFileChunks.length) {
      const { fileSize, chunkSize } = this
      const chunkTotal = Math.ceil(fileSize / chunkSize)
      this.sliceFileChunks = Array.from({ length: chunkTotal }, (_, index) => ({
        index,
        file: null,
        start: index * chunkSize,
        end: index + 1 === chunkTotal ? fileSize - 1 : (index + 1) * chunkSize - 1,
        ...reset,
      }))
      return
    }
    this.sliceFileChunks = (fileChunks ?? this.sliceFileChunks).map((v) => ({ ...v, ...reset }))
  }

  destroy() {
    this.reset()
    this.events = new Emitter()
    this.downloadRequestInstance = null
  }

  reset() {
    this.currentRequestChunkIndex = -1
    this.sliceFileChunks = []
    this.abort()
    this.isCancel = false
    this.isPause = false
  }

  on<Key extends DownloadEventKey>(eventName: Key, cb: DownloadEventType[Key]) {
    this.events.on(eventName, cb)
    return this
  }

  off<Key extends DownloadEventKey>(eventName: Key, cb?: DownloadEventType[Key]) {
    this.events.off(eventName, cb)
    return this
  }

  emit<Key extends DownloadEventKey>(eventName: Key, ...args: Parameters<DownloadEventType[Key]>) {
    this.events.emit(eventName, ...args)
    return this
  }

  getData() {
    const chunks = this.sliceFileChunks.map((v) => {
      let status = this.isCancel ? 'cancel' : this.isPause ? 'pause' : v.status
      if (v.progress === 100 || v.progress === 0) status = v.status

      return {
        status,
        progress: v.progress,
        start: v.start,
        end: v.end,
        index: v.index,
      }
    })
    return { chunks }
  }

  private get stop() {
    return this.isCancel || this.isPause
  }

  /**
   * Status
   */
  get status(): SliceDownloadStatus {
    const chunks = this.sliceFileChunks
    if (this.isCancel) return 'cancel'

    if (this.isPause) return 'pause'

    if (!chunks.length) return 'ready'

    if (chunks.some((v) => v.status === 'downloading')) return 'downloading'

    if (chunks.every((v) => v.status === 'success')) return 'success'

    if (chunks.some((v) => v.status === 'error')) return 'error'

    return 'ready'
  }

  /**
   * Total download progress
   */
  get progress() {
    const chunks = this.sliceFileChunks
    const len = chunks.length
    if (!len) return 0
    const progressTotal = chunks.map((v) => v.progress).reduce((pre, cur) => pre + cur, 0)
    return progressTotal / len
  }
}

export function defineSliceDownload(options: SliceDownloadOptions) {
  return new SliceDownload(options)
}

function mergeRangeHeaders(headers: RequestHeaders | undefined, range: string): RequestHeaders {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const nextHeaders = new Headers(headers)
    nextHeaders.set('Range', range)
    return nextHeaders
  }

  return { ...headers, Range: range }
}

/**
 * Merge files
 * @param files file list
 * @param filename file name
 * @param type file type
 */
export function mergeFile(files: (File | Blob)[], filename: string, type: string) {
  return new File(files, filename, { type })
}

/**
 * Save file
 * @param file file
 * @param filename file name
 */
export function saveFile(file: File | Blob, filename: string) {
  const url = URL.createObjectURL(file)
  const aLink = document.createElement('a')
  aLink.href = url
  aLink.download = filename
  aLink.click()
  aLink.remove()
  // A synchronous revoke can cancel the download before the browser reads the
  // blob (e.g. Firefox), so release it after a short delay.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
