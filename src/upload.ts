import type { FileChunk, SliceUploadItem, SliceUploadOptions } from '.'
import { getHashChunks } from '.'

export type IAjax = (params: { chunk: File; index: number; all: number; md5: string }) => Promise<boolean | void>

export interface RequestOptions {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  data?: any
  timeout?: number
}

/**
 * 分片上传
 */
export class SliceUpload {
  private file: File | null
  private chunkSize: number
  private realPreHash: boolean
  private realChunkHash: boolean
  private retryCount: number
  private retryDelay: number
  private sliceUploadList: SliceUploadItem[] = []

  private preHash = ''
  private fileChunks: FileChunk[] = []

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
    } = options || {}

    this.chunkSize = chunkSize
    this.retryCount = retryCount
    this.retryDelay = retryDelay
    this.realPreHash = realPreHash
    this.realChunkHash = realChunkHash
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
  async setUploadRequest(request: IAjax) {
    this.uploadRequestInstance = request
    return this
  }

  request(options: RequestOptions) {
    // const { url, method, headers = {}, data, timeout = 30000 } = options
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
   * @returns
   */
  async start() {
    if (!this._hasFile)
      return this

    // if (!this.uploadRequestInstance)
    //   throw new Error('请先设置上传请求函数')

    if (!this.preHash && !this.fileChunks.length) {
      const { file, chunkSize, realPreHash, realChunkHash } = this
      const { preHash, fileChunks } = await getHashChunks({ file: file!, chunkSize, realPreHash, realChunkHash })
      this.preHash = preHash
      this.fileChunks = fileChunks
    }
  }

  cancel() {
  }

  get hasFile() {
    return !!this.file?.size
  }

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
   * 获取分片，hash
   * @returns
   */
  getHashChunks() {
    const { preHash, fileChunks } = this
    return { preHash, chunks: fileChunks }
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
