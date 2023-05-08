import { ajaxRequest } from './utils/ajax'
import type { AjaxRequestOptions, RequestHeads, RequestMethod } from './utils/ajax'
import type { FileChunk, SliceUploadItem, SliceUploadOptions, SliceUploadStatus } from '.'
import { getHashChunks } from '.'

interface Result<D = any> {
  code: number
  data?: D
}

export type IAjax = (params: { chunk: File; index: number; all: number; hash: string }) => Promise<boolean | Result>

export interface RequestOptions {
  url: string
  method: RequestMethod
  // data: any
  headers?: RequestHeads
  timeout?: number
  withCredentials?: boolean
}

export interface RequestFileChunk extends FileChunk {
  status: SliceUploadStatus
  progress: number
  retryCount: number
  requestInstance: IAjax
}

/**
 * 分片上传
 */
export class SliceUpload {
  private file: File | null
  private progress = 0
  private chunkSize: number
  private realPreHash: boolean
  private realChunkHash: boolean
  private retryCount: number
  private retryDelay: number
  private sliceUploadList: SliceUploadItem[] = []

  private status: SliceUploadStatus = 'ready'

  private preHash = ''
  private requestFileChunks: RequestFileChunk[] = []

  private timeout = 0

  private uploadRequestInstance: IAjax | null = null
  private preVerifyRequestInstance: IAjax | null = null

  constructor(options?: SliceUploadOptions) {
    this.file = null

    const {
      retryCount = 3,
      retryDelay = 300,
      realPreHash = false,
      realChunkHash = false,
      chunkSize = 1024 ** 2 * 2,
      timeout = 15000,
    } = options || {}

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
    this.file = file
    return this
  }

  /**
   * 设置上传请求函数
   * @param request
   * @returns
   */
  setUploadRequest(request: IAjax | RequestOptions) {
    if (typeof request === 'function')
      this.uploadRequestInstance = request
    else
      this.uploadRequestInstance = this.getAjaxRequest(request)

    return this
  }

  getAjaxRequest<Options extends RequestOptions>(options: Options): IAjax {
    const { timeout } = this
    return params => new Promise((resolve, reject) => {
      const data = new FormData()
      data.append('filename', this.file?.name!)
      Object.keys(params).forEach((key) => {
        let item = params[key as keyof typeof params]
        item = typeof item === 'number' ? String(item) : item
        data.append(key, item)
      })
      const ajaxRequestOptions: AjaxRequestOptions = {
        withCredentials: false,
        ...options,
        data,
        timeout,
        onError(evt) {
          reject(evt)
        },
        onSuccess(evt) {
          resolve(evt)
        },
        onUploadProgress(evt) {
          const percent = evt.percent
          console.log('onUploadProgress', evt)
        },
      }

      ajaxRequest(ajaxRequestOptions)
    })
  }

  /**
   * 设置上传前验证函数
   * @param request
   * @returns
   */
  setPreVerifyRequest(request: IAjax) {
    this.preVerifyRequestInstance = request
    return this
  }

  /**
   * 开始上传
   */
  async start() {
    if (!this._hasFile)
      return

    if (!this.uploadRequestInstance)
      throw new Error('请先设置上传请求函数')

    if (!this.preHash && !this.requestFileChunks.length) {
      const { file, chunkSize, realPreHash, realChunkHash } = this
      const { preHash, fileChunks } = await getHashChunks({ file: file!, chunkSize, realPreHash, realChunkHash })
      this.preHash = preHash
      this.requestFileChunks = fileChunks.map(v => ({ ...v }))
    }

    // TODO: 预检
    if (this.preVerifyRequestInstance) {
      // console.log('preVerifyRequestInstance')
    }

    const request = this.uploadRequestInstance

    let index = 0
    while (index < this.requestFileChunks.length) {
      let flag = true
      try {
        const fileChunk = this.requestFileChunks[index]
        const params = { ...fileChunk, chunk: fileChunk.chunk as File, hash: fileChunk.chunkHash, all: this.requestFileChunks.length }
        Reflect.deleteProperty(params, 'chunkHash')
        const result = await request(params as Parameters<IAjax>[number])
        if (typeof result === 'object' && result.code !== 200)
          flag = false
      }
      catch (e) {
        flag = false
      }

      index++
      console.log(flag)
    }
  }

  /**
   * 暂停上传
   */
  pause() {}

  /**
   * 取消上传
   */
  cancel() {}

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

  /**
   * 获取文件
   * @returns
   */
  getFile() {
    return this.file
  }

  /**
   * 获取分片，hash, file
   * @returns
   */
  getData() {
    const { preHash, requestFileChunks: fileChunks, file } = this
    return { preHash, file, chunks: fileChunks }
  }

  get isRealPreHash() {
    return this.file?.size! <= this.chunkSize || this.realPreHash
  }

  get isRealChunkHash() {
    return this.file?.size! <= this.chunkSize || this.realChunkHash
  }
}

export function defineSliceUpload(options?: SliceUploadOptions) {
  return new SliceUpload(options)
}
