import { ajaxRequest } from './utils/ajax'
import { Emitter } from './utils/emitter'
import { promisePool } from './utils/pool'
import type { AjaxRequestOptions, CustomXHR, RequestHeaders, RequestMethod } from './utils/ajax'
import { getHashChunks } from '.'
import type { FileChunk, SliceUploadOptions, SliceUploadStatus, UploadEventKey, UploadEventType } from '.'

export interface UploadParams {
  chunk: File | Blob
  index: number
  chunkTotal: number
  preHash: string
  filename: string
  chunkHash: string
}

export interface PreVerifyUploadParams {
  preHash: string
  filename: string
  chunkSize: number
  chunkTotal: number
}

export type UploadRequest = (params: UploadParams) => Promise<boolean | void>

export type PreVerifyUploadRequest = (params: PreVerifyUploadParams) => Promise<string[] | boolean>

export interface RequestOptions {
  url: string
  /**
   * @default 'POST'
   */
  method?: RequestMethod
  data: any
  headers?: RequestHeaders
  timeout?: number
  withCredentials?: boolean
}

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
  private sliceFileChunks: SliceUploadFileChunk[] = []

  private isCancel = false
  private isPause = false

  private events = new Emitter()

  private uploadRequestInstance: UploadRequest | null = null
  private preVerifyRequestInstance: PreVerifyUploadRequest | null = null

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
    file && this.reset()
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

  private reset() {
    this.preHash = null
    this.currentRequestChunkHash = null
    this.sliceFileChunks = []
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
      let xhr: CustomXHR
      const chunk = this.findSliceFileChunk(this.currentRequestChunkHash!)!

      const retryFn = () => {
        chunk.retryCount++
        xhr!.request()
      }

      const abortFn = () => {
        if (this.stop)
          xhr && xhr.abort()
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
          if (chunk.progress !== 100)
            chunk.status = 'ready'

          this.currentRequestChunkHash = null
          reject(evt)
        },
        onError: (evt) => {
          // 重试
          if (chunk.retryCount < this.retryCount) {
            this.retryDelay > 0 ? setTimeout(() => retryFn(), this.retryDelay) : retryFn()
            return
          }
          chunk.status = 'fail'
          this.currentRequestChunkHash = null
          this.emit('error', evt)
          reject(evt)
        },
        onSuccess: (evt) => {
          resolve(evt)
        },
        onUploadProgress: (evt) => {
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
            chunk.status = 'uploading'

          this.emitProgress()
        },
      }

      xhr = ajaxRequest(ajaxRequestOptions)
      !this.stop && xhr.request()
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
    if (['uploading', 'success'].includes(this.status))
      return

    if (!this._hasFile)
      return

    if (!this.uploadRequestInstance)
      throw new Error('请先设置上传请求函数')

    if (!this.preHash && !this.sliceFileChunks.length) {
      const { file, chunkSize, realPreHash, realChunkHash } = this
      const { preHash, fileChunks } = await getHashChunks({ file: file!, chunkSize, realPreHash, realChunkHash })
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
        const checkList = await this.preVerifyRequestInstance({ preHash: preHash!, filename: file!.name!, chunkSize, chunkTotal: this.sliceFileChunks.length })
        if (checkList === true)
          result = _sliceFileChunks.map(v => v.chunkHash)
        else if (Array.isArray(checkList))
          result = checkList
      }
      catch (e) {
        console.error('preVerifyRequest is fail', e)
        result = []
      }
      _sliceFileChunks = _sliceFileChunks.filter(v => !result.includes(v.chunkHash))
      this.sliceFileChunks.forEach((v) => {
        if (result.includes(v.chunkHash)) {
          v.status = 'success'
          v.progress = 100
        }
      })
      this.emitFinish()
    }

    this.isCancel = false
    this.isPause = false

    const failChunks = this.sliceFileChunks.filter(v => v.status === 'fail')
    failChunks.forEach(v => v.status = 'ready')

    this.emit('start')
    this.emitProgress()

    if (!_sliceFileChunks.length)
      return

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

  private emitFinish() {
    if (this.status === 'success')
      this.emit('finish', { preHash: this.preHash!, filename: this.file?.name!, file: this.file!, chunkTotal: this.sliceFileChunks.length, chunkSize: this.chunkSize })
  }

  private createPromiseList(chunks: SliceUploadFileChunk[]) {
    const beUploadChunks = chunks.filter(v => v.status === 'ready')
    const len = beUploadChunks.length
    const promiseList = beUploadChunks.map((v) => {
      const { chunk, index, chunkHash } = v
      const sliceChunk = this.findSliceFileChunk(chunkHash)!
      const params: UploadParams = { chunk, index, chunkHash, preHash: this.preHash!, filename: this.file?.name!, chunkTotal: this.sliceFileChunks.length }
      return async () => {
        let flag = true
        try {
          this.currentRequestChunkHash = chunkHash
          const result = await this.uploadRequestInstance!(params)
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

        this.currentRequestChunkHash = null
        return flag
      }
    })

    return { promiseList, len }
  }

  private initSliceFileChunks(fileChunks?: FileChunk[]) {
    const initialSliceFileChunkOther: Omit<SliceUploadFileChunk, keyof FileChunk> = {
      status: 'ready',
      progress: 0,
      retryCount: 0,
    }

    this.sliceFileChunks = (fileChunks ?? this.sliceFileChunks).map(v => ({ ...v, ...initialSliceFileChunkOther }))
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
    this.currentRequestChunkHash = null
    this.emit('cancel')
  }

  findSliceFileChunk(chunkHash: string) {
    return this.sliceFileChunks.find(v => v.chunkHash === chunkHash)
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
    const chunks = sliceFileChunks.map(v => ({
      status: v.status,
      progress: v.progress,
      chunkHash: v.chunkHash,
      index: v.index,
    }))
    return { preHash, file, chunks }
  }

  /**
   * 是否有文件
   */
  get hasFile() {
    return !!this.file?.size
  }

  /**
   * 是否有文件，没有则抛出错误
   */
  private get _hasFile() {
    if (!this.file)
      throw new Error('请先设置上传文件')

    if (!this.file?.size)
      throw new Error('上传文件大小不能为0')

    return true
  }

  get isRealPreHash() {
    return this.file?.size! <= this.chunkSize || this.realPreHash
  }

  get isRealChunkHash() {
    return this.file?.size! <= this.chunkSize || this.realChunkHash
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
    if (!len)
      return 0
    const progressTotal = chunks.map(v => v.progress).reduce((pre, cur) => pre + cur, 0)
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
    if (!chunks.length)
      return 'ready'

    if (chunks.some(v => v.status === 'uploading'))
      return 'uploading'

    if (chunks.every(v => v.status === 'success'))
      return 'success'

    if (chunks.every(v => v.status !== 'uploading') && chunks.some(v => v.status === 'fail'))
      return 'fail'

    return 'ready'
  }
}

export function defineSliceUpload(options?: SliceUploadOptions) {
  return new SliceUpload(options)
}
