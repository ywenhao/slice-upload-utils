import type { DownloadEventKey, DownloadEventType, SliceDownloadStatus } from './types'
import type { AjaxRequestOptions, CustomXHR, RequestHeaders } from './utils/ajax'
import { ajaxRequest } from './utils/ajax'
import { Emitter } from './utils/emitter'
import { promisePool } from './utils/pool'
import type { RequestOptions } from '.'

export interface DownloadParams {
  start: number
  end: number
  index: number
  filename: string
  fileType: string
  chunkSize: number
  chunkTotal: number
}

export type DownloadRequest = (params: DownloadParams) => Promise<false | File | Blob>

export interface SliceDownloadOptions {
  fileSize: number
  filename: string
  /**
   * 文件MIME类型
   * @see https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
   */
  fileType: string
  /**
   * 是否自动保存
   * @default true
   */
  autoSave?: boolean
  /**
   * 分片大小
   * @default 1024 * 1024 * 2
   */
  chunkSize?: number
  /**
   * 并发上传数
   * @default 3
   */
  poolCount?: number
  /**
     * 请求失败后，重试次数
     * @default 3
     */
  retryCount?: number
  /**
     * 请求失败后，重试间隔时间
     * @default 300
     */
  retryDelay?: number
  /**
     * 请求超时时间(15s)
     * @default 15000
     */
  timeout?: number
}

export interface SliceDownloadFileChunk {
  file: Blob | File | null
  index: number
  start: number
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

  constructor(options: SliceDownloadOptions) {
    const {
      filename,
      fileSize,
      fileType,
      poolCount = 3,
      retryCount = 3,
      autoSave = true,
      timeout = 15000,
      retryDelay = 300,
      chunkSize = 1024 * 1024 * 2,
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
    this.check()
  }

  private check() {
    if (!this.filename)
      throw new Error('filename is required')

    if (!this.fileSize)
      throw new Error('fileSize is required')
  }

  async start() {
    if (['downloading', 'success'].includes(this.status))
      return

    this.check()
    if (!this.sliceFileChunks.length) {
      this.initSliceFileChunks()
      this.emitProgress()
    }

    const _sliceFileChunks = this.sliceFileChunks.filter(v => v.status !== 'success' && v.progress !== 100)
    if (this.sliceFileChunks.length && !_sliceFileChunks.length) {
      this.emitProgress()
      this.emitFinish()
      return
    }

    this.isCancel = false
    this.isPause = false

    const failChunks = this.sliceFileChunks.filter(v => v.status === 'fail')
    failChunks.forEach(v => v.status = 'ready')

    this.emit('start')
    this.emitProgress()

    const { promiseList } = this.createPromiseList(_sliceFileChunks)
    promisePool({
      promiseList,
      limit: this.poolCount,
      beStop: () => this.stop,
      resolve: () => {
        this.emitFinish()
      },
    })
  }

  /**
   * 暂停上传
   */
  pause() {
    this.isPause = true
    this.emit('pause')
  }

  /**
   * 取消上传
   */
  cancel() {
    this.isCancel = true
    this.initSliceFileChunks()
    this.emitProgress()
    this._progress = -1
    this.currentRequestChunkIndex = -1
    this.emit('cancel')
  }

  private createPromiseList(chunks: SliceDownloadFileChunk[]) {
    const beDownloadChunks = chunks.filter(v => v.status === 'ready')
    const len = beDownloadChunks.length
    const { filename, chunkSize, fileType } = this
    const chunkTotal = this.sliceFileChunks.length
    const promiseList = beDownloadChunks.map((v) => {
      const { start, end, index } = v
      const sliceChunk = this.sliceFileChunks[index]!
      const params: DownloadParams = { start, end, index, fileType, filename, chunkSize, chunkTotal }
      return async () => {
        let flag = true
        try {
          this.currentRequestChunkIndex = index
          const result = await this.downloadRequestInstance!(params)
          if ((result instanceof Blob))
            sliceChunk.file = result
          if (result === false)
            flag = false
        }
        catch (e) {
          flag = false
        }

        if (flag) {
          sliceChunk.status = 'success'
          sliceChunk.retryCount = 0
          sliceChunk.progress = 100
          this.emitProgress()
        }

        this.currentRequestChunkIndex = -1
        return flag
      }
    })

    return { promiseList, len }
  }

  ajaxRequest<D = any>(options: RequestOptions) {
    const { timeout } = this

    return new Promise<D>((resolve, reject) => {
      let xhr: CustomXHR
      const chunk = this.sliceFileChunks[this.currentRequestChunkIndex]

      const retryFn = () => {
        chunk.retryCount++
        xhr!.request()
      }

      const abortFn = () => {
        if (this.stop)
          xhr && xhr.abort()
        return this.stop
      }
      const { start, end } = chunk
      const headers: RequestHeaders = {
        Range: `bytes=${start}-${end}`,
        ...options.headers,
      }
      const ajaxRequestOptions: AjaxRequestOptions = {
        method: 'POST',
        withCredentials: false,
        timeout,
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
          if (chunk.progress !== 100)
            chunk.status = 'ready'

          this.currentRequestChunkIndex = -1
          reject(evt)
        },
        onError: (evt) => {
          // 重试
          if (chunk.retryCount < this.retryCount) {
            this.retryDelay > 0 ? setTimeout(() => retryFn(), this.retryDelay) : retryFn()
            return
          }
          chunk.status = 'fail'
          this.currentRequestChunkIndex = -1
          this.emit('error', evt)
          reject(evt)
        },
        onSuccess: (evt) => {
          resolve(evt)
        },
        onDownloadProgress: (evt) => {
          if (evt.percent === 100) {
            chunk.status = 'success'
            chunk.retryCount = 0
            chunk.progress = 100
          }

          const progress = chunk.progress
          // 防止进度条出现后退
          if (progress < evt.percent)
            chunk.progress = evt.percent

          if (evt.percent !== 100 && !abortFn())
            chunk.status = 'downloading'

          this.emitProgress()
        },
      }

      xhr = ajaxRequest(ajaxRequestOptions)
      !this.stop && xhr.request()
    })
  }

  /**
   * 设置下载请求函数
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
      const chunks = this.sliceFileChunks.filter(v => v.status === 'success' && v.file).map(v => v.file!)
      const file = mergeFile(chunks, filename, fileType)
      this.autoSave && saveFile(file, filename)
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
        end: Math.min((index + 1) * chunkSize, fileSize),
        ...reset,
      }))
      return
    }
    this.sliceFileChunks = (fileChunks ?? this.sliceFileChunks).map(v => ({ ...v, ...reset }))
  }

  destroy() {
    this.reset()
    this.events = new Emitter()
    this.downloadRequestInstance = null
  }

  reset() {
    this.currentRequestChunkIndex = -1
    this.sliceFileChunks = []
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

  private get stop() {
    return this.isCancel || this.isPause
  }

  /**
   * 状态
   */
  get status(): SliceDownloadStatus {
    const chunks = this.sliceFileChunks
    if (!chunks.length)
      return 'ready'

    if (chunks.some(v => v.status === 'downloading'))
      return 'downloading'

    if (chunks.every(v => v.status === 'success'))
      return 'success'

    if (chunks.every(v => v.status !== 'downloading') && chunks.some(v => v.status === 'fail'))
      return 'fail'

    return 'ready'
  }

  /**
   * 上传总进度
   */
  get progress() {
    const chunks = this.sliceFileChunks
    const len = chunks.length
    if (!len)
      return 0
    const progressTotal = chunks.map(v => v.progress).reduce((pre, cur) => pre + cur, 0)
    return progressTotal / len
  }
}

export function defineSliceDownload(options: SliceDownloadOptions) {
  return new SliceDownload(options)
}

/**
 * 文件合并
 * @param files 文件列表
 * @param filename 文件名
 * @param type 文件类型
 */
export function mergeFile(files: (File | Blob)[], filename: string, type: string) {
  return new File(files, filename, { type })
}

/**
 * 保存文件
 * @param file 文件
 * @param filename 文件名
 */
export function saveFile(file: File | Blob, filename: string) {
  const aLink = document.createElement('a')
  aLink.href = URL.createObjectURL(file)
  aLink.download = filename
  aLink.click()
  URL.revokeObjectURL(aLink.href)
  aLink.remove()
}
