import type { RequestOptions } from './request'
import type { AjaxRequestOptions, CustomXHR } from './utils/ajax'
import type { FileChunk, SliceUploadOptions, SliceUploadStatus } from './types'
import type { UploadEventKey, UploadEventType } from './types/upload/event'
import { AjaxRequestError, ajaxRequest } from './utils/ajax'
import { getHashChunks } from './utils/chunk'
import { Emitter } from './utils/emitter'
import { promisePool } from './utils/pool'

export interface UploadParams {
  chunk: File | Blob
  index: number
  chunkTotal: number
  preHash: string
  filename: string
  chunkHash: string
  ajaxRequest: <D = any>(options: RequestOptions) => Promise<D>
}

export interface PreVerifyUploadParams {
  preHash: string
  filename: string
  chunkSize: number
  chunkTotal: number
}

export type UploadRequest = (params: UploadParams) => Promise<boolean | void>

export type PreVerifyUploadRequest = (params: PreVerifyUploadParams) => Promise<string[] | boolean>

export interface SliceUploadFileChunk extends FileChunk {
  status: SliceUploadStatus
  progress: number
  retryCount: number
}

/**
 * 分片上传
 */
export class SliceUpload {
  private file: File | null
  private poolCount: number
  private chunkSize: number
  private realPreHash: boolean
  private realChunkHash: boolean
  private retryCount: number
  private retryDelay: number
  private timeout = 0

  private preHash: null | string = ''
  private currentRequestChunkHash: string | null = null
  private currentRequestChunkIndex = -1
  private sliceFileChunks: SliceUploadFileChunk[] = []

  private isCancel = false
  private isPause = false

  private events = new Emitter()

  private uploadRequestInstance: UploadRequest | null = null
  private preVerifyRequestInstance: PreVerifyUploadRequest | null = null

  private xhr: (CustomXHR | null)[] = []

  constructor(options?: SliceUploadOptions) {
    this.file = options?.file || null

    const {
      poolCount = 3,
      retryCount = 3,
      timeout = 15000,
      retryDelay = 300,
      realPreHash = false,
      realChunkHash = false,
      chunkSize = 1024 ** 2 * 2,
    } = options || {}

    this.poolCount = poolCount
    this.chunkSize = chunkSize
    this.retryCount = retryCount
    this.retryDelay = retryDelay
    this.realPreHash = realPreHash
    this.realChunkHash = realChunkHash

    this.timeout = timeout
  }

  /**
   * 设置上传文件(单个)
   * @param file
   * @returns
   */
  setFile(file: File) {
    if (file) this.reset()
    this.file = file
    return this
  }

  on<Key extends UploadEventKey>(eventName: Key, cb: UploadEventType[Key]) {
    this.events.on(eventName, cb)
    return this
  }

  off<Key extends UploadEventKey>(eventName: Key, cb?: UploadEventType[Key]) {
    this.events.off(eventName, cb)
    return this
  }

  emit<Key extends UploadEventKey>(eventName: Key, ...args: Parameters<UploadEventType[Key]>) {
    this.events.emit(eventName, ...args)
    return this
  }

  reset() {
    this.preHash = null
    this.currentRequestChunkHash = null
    this.currentRequestChunkIndex = -1
    this.sliceFileChunks = []
    this.abort()
    this.isCancel = false
    this.isPause = false
  }

  /**
   * 销毁事件
   */
  destroy() {
    this.reset()
    this.events = new Emitter()
    this.file = null
    this.uploadRequestInstance = null
    this.preVerifyRequestInstance = null
  }

  /**
   * 设置上传请求函数
   * @param request UploadRequest
   * @returns
   */
  setUploadRequest(request: UploadRequest) {
    this.uploadRequestInstance = request
    return this
  }

  ajaxRequest<D = any>(options: RequestOptions) {
    const { timeout } = this

    return new Promise<D>((resolve, reject) => {
      const idx = this.findRequestChunkIndex(options)
      const chunk = this.sliceFileChunks[idx]
      if (!chunk) {
        reject(
          new AjaxRequestError(
            'upload chunk is not found',
            700,
            options.method || 'POST',
            options.url,
          ),
        )
        return
      }

      if (this.stop) {
        reject(new AjaxRequestError('upload stopped', 0, options.method || 'POST', options.url))
        return
      }

      const retryFn = () => {
        if (this.stop || !this.xhr[idx]) {
          reject(new AjaxRequestError('upload stopped', 0, options.method || 'POST', options.url))
          return
        }
        chunk.retryCount++
        this.xhr[idx]!.request()
      }

      const abortFn = () => {
        if (this.stop) this.xhr[idx]?.abort()
        return this.stop
      }
      const ajaxRequestOptions: AjaxRequestOptions = {
        method: 'POST',
        withCredentials: false,
        timeout,
        ...options,
        readystatechange: () => {
          abortFn()
        },
        onLoadstart: () => {
          chunk.status = 'uploading'
          abortFn()
        },
        onAbort: (evt) => {
          if (chunk.progress !== 100) chunk.status = 'ready'

          if (this.currentRequestChunkIndex === idx) {
            this.currentRequestChunkIndex = -1
            this.currentRequestChunkHash = null
          }
          reject(evt)
        },
        onError: (evt) => {
          // 重试
          if (chunk.retryCount < this.retryCount) {
            if (this.retryDelay > 0) setTimeout(() => retryFn(), this.retryDelay)
            else retryFn()
            return
          }
          chunk.status = 'error'
          if (this.currentRequestChunkIndex === idx) {
            this.currentRequestChunkIndex = -1
            this.currentRequestChunkHash = null
          }
          reject(evt)
        },
        onSuccess: (evt) => {
          resolve(evt)
        },
        onUploadProgress: (evt) => {
          if (abortFn()) return

          const progress = chunk.progress
          // 防止进度条出现后退
          if (progress < evt.percent) chunk.progress = evt.percent

          // 在接口返回之前，进度条不得超过99
          if (evt.percent >= 99) chunk.progress = 99

          if (evt.percent !== 100 && !this.stop && chunk.status !== 'error')
            chunk.status = 'uploading'

          this.emitProgress()
        },
      }

      this.xhr[idx] = ajaxRequest(ajaxRequestOptions)
      this.xhr[idx]!.request()
    })
  }

  /**
   * 设置上传前验证函数
   * @param request
   * @returns
   */
  setPreVerifyRequest(request: PreVerifyUploadRequest) {
    this.preVerifyRequestInstance = request
    return this
  }

  /**
   * 开始上传
   */
  async start() {
    if (['uploading', 'success'].includes(this.status)) return

    this.check()
    this.isCancel = false
    this.isPause = false

    if (!this.preHash && !this.sliceFileChunks.length) {
      const { file, chunkSize, realPreHash, realChunkHash } = this
      const { preHash, fileChunks } = await getHashChunks({
        file: file!,
        chunkSize,
        realPreHash,
        realChunkHash,
      })
      if (this.stop) return
      this.preHash = preHash

      this.initSliceFileChunks(fileChunks)
      this.emitProgress()
    }

    let _sliceFileChunks = this.sliceFileChunks.slice()
    //  预检
    if (this.preVerifyRequestInstance) {
      const { preHash, file, chunkSize } = this
      let result: string[] = []
      try {
        const checkList = await this.preVerifyRequestInstance({
          preHash: preHash!,
          filename: file!.name!,
          chunkSize,
          chunkTotal: this.sliceFileChunks.length,
        })
        if (checkList === true) result = _sliceFileChunks.map((v) => v.chunkHash)
        else if (Array.isArray(checkList)) result = checkList
      } catch (e) {
        console.error('preVerifyRequest is fail', e)
        result = []
      }
      if (this.stop) return

      const verifiedIndexes = this.getVerifiedChunkIndexes(_sliceFileChunks, result)
      _sliceFileChunks = _sliceFileChunks.filter((v) => !verifiedIndexes.has(v.index))
      this.sliceFileChunks.forEach((v) => {
        if (verifiedIndexes.has(v.index)) {
          v.status = 'success'
          v.progress = 100
        }
      })
      this.emitFinish()
    }

    const failChunks = this.sliceFileChunks.filter((v) => v.status === 'error')
    failChunks.forEach((v) => (v.status = 'ready'))

    this.emit('start')
    this.emitProgress()

    if (!_sliceFileChunks.length) return

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

  private emitFinish() {
    if (this.status === 'success')
      this.emit('finish', {
        preHash: this.preHash!,
        filename: this.file!.name,
        file: this.file!,
        chunkTotal: this.sliceFileChunks.length,
        chunkSize: this.chunkSize,
      })
  }

  private createPromiseList(chunks: SliceUploadFileChunk[]) {
    const beUploadChunks = chunks.filter((v) => v.status === 'ready')
    const len = beUploadChunks.length
    const promiseList = beUploadChunks.map((v) => {
      const { chunk, index, chunkHash } = v
      const sliceChunk = this.sliceFileChunks[index]!
      const params = {
        chunk,
        index,
        chunkHash,
        preHash: this.preHash!,
        filename: this.file!.name,
        chunkTotal: this.sliceFileChunks.length,
      } as UploadParams
      Object.defineProperty(params, 'ajaxRequest', {
        enumerable: false,
        value: <D = any>(options: RequestOptions) =>
          this.ajaxRequest<D>({ ...options, chunkHash, chunkIndex: index }),
      })
      return async () => {
        let flag = true
        let error: unknown
        try {
          this.currentRequestChunkIndex = index
          this.currentRequestChunkHash = chunkHash
          const result = await this.uploadRequestInstance!(params)
          if (result === false) flag = false
        } catch (e) {
          flag = false
          error = e
        }

        if (this.stop) {
          if (this.currentRequestChunkIndex === index) {
            this.currentRequestChunkIndex = -1
            this.currentRequestChunkHash = null
          }
          return false
        }

        // 接口返回之后，进度条才能到100
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
              new AjaxRequestError(`chunk ${sliceChunk.index} uploaded, request fail`, 700, '', ''),
          )
        }

        if (this.currentRequestChunkIndex === index) {
          this.currentRequestChunkIndex = -1
          this.currentRequestChunkHash = null
        }
        return flag
      }
    })

    return { promiseList, len }
  }

  private findRequestChunkIndex(options: RequestOptions) {
    if (options.chunkIndex !== undefined) return options.chunkIndex

    const chunkHash = options.chunkHash ?? this.currentRequestChunkHash
    if (
      chunkHash &&
      this.currentRequestChunkIndex >= 0 &&
      this.sliceFileChunks[this.currentRequestChunkIndex]?.chunkHash === chunkHash
    )
      return this.currentRequestChunkIndex

    if (chunkHash) return this.sliceFileChunks.findIndex((v) => v.chunkHash === chunkHash)

    return this.currentRequestChunkIndex
  }

  private getVerifiedChunkIndexes(chunks: SliceUploadFileChunk[], chunkHashes: string[]) {
    const verifiedIndexes = new Set<number>()
    const hashCounts = new Map<string, number>()
    chunkHashes.forEach((chunkHash) => {
      hashCounts.set(chunkHash, (hashCounts.get(chunkHash) || 0) + 1)
    })

    chunks.forEach((chunk) => {
      const count = hashCounts.get(chunk.chunkHash) || 0
      if (!count) return

      verifiedIndexes.add(chunk.index)
      if (count === 1) hashCounts.delete(chunk.chunkHash)
      else hashCounts.set(chunk.chunkHash, count - 1)
    })

    return verifiedIndexes
  }

  private initSliceFileChunks(fileChunks?: FileChunk[]) {
    const initialSliceFileChunkOther: Omit<SliceUploadFileChunk, keyof FileChunk> = {
      status: 'ready',
      progress: 0,
      retryCount: 0,
    }

    this.sliceFileChunks = (fileChunks ?? this.sliceFileChunks).map((v) => ({
      ...v,
      ...initialSliceFileChunkOther,
    }))
  }

  private _progress = -1
  emitProgress() {
    const progress = this.progress
    if (progress !== this._progress) {
      this.emit('progress', { progress })
      this._progress = progress
    }
  }

  /**
   * 取消上传
   */
  abort() {
    this.xhr.forEach((v) => v && v.abort())
    this.xhr = []
  }

  /**
   * 暂停上传
   */
  pause() {
    this.isPause = true
    this.abort()
    this.emit('pause')
  }

  /**
   * 取消上传
   */
  cancel() {
    this.isCancel = true
    this.abort()
    this.initSliceFileChunks()
    this.emitProgress()
    this._progress = -1
    this.currentRequestChunkHash = null
    this.currentRequestChunkIndex = -1
    this.emit('cancel')
  }

  findSliceFileChunk(chunkHash: string) {
    return this.sliceFileChunks.find((v) => v.chunkHash === chunkHash)
  }

  private check() {
    if (!this.file) throw new Error('file is required')
    if (!this.uploadRequestInstance) throw new Error('uploadRequestInstance is required')
    if (!this.file?.size) throw new Error('file size is 0')
  }

  /**
   * 获取文件
   */
  getFile() {
    return this.file
  }

  /**
   * 获取分片，hash, file, chunks
   */
  getData() {
    const { preHash, sliceFileChunks, file } = this
    const chunks = sliceFileChunks.map((v) => {
      let status = this.isCancel ? 'cancel' : this.isPause ? 'pause' : v.status
      if (v.progress === 100 || v.progress === 0) status = v.status

      return {
        status,
        progress: v.progress,
        chunkHash: v.chunkHash,
        index: v.index,
      }
    })
    return { preHash, file, chunks }
  }

  /**
   * 是否有文件
   */
  get hasFile() {
    return !!this.file?.size
  }

  get isRealPreHash() {
    return (this.file?.size ?? 0) <= this.chunkSize || this.realPreHash
  }

  get isRealChunkHash() {
    return (this.file?.size ?? 0) <= this.chunkSize || this.realChunkHash
  }

  private get stop() {
    return this.isCancel || this.isPause
  }

  /**
   * 上传总进度
   */
  get progress() {
    const chunks = this.sliceFileChunks
    const len = chunks.length
    if (!len) return 0
    const progressTotal = chunks.map((v) => v.progress).reduce((pre, cur) => pre + cur, 0)
    return progressTotal / len
  }

  /**
   * 是否已经设置上传函数
   */
  get hasRequestInstance() {
    return !!this.uploadRequestInstance
  }

  /**
   * 状态
   */
  get status(): SliceUploadStatus {
    const chunks = this.sliceFileChunks
    if (this.isCancel) return 'cancel'

    if (this.isPause) return 'pause'

    if (!chunks.length) return 'ready'

    if (chunks.some((v) => v.status === 'uploading')) return 'uploading'

    if (chunks.every((v) => v.status === 'success')) return 'success'

    if (chunks.some((v) => v.status === 'error')) return 'error'

    return 'ready'
  }
}

export function defineSliceUpload(options?: SliceUploadOptions) {
  return new SliceUpload(options)
}
