import type { SliceUploadOptions } from '.'

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
  private retryCount: number
  private retryDelay: number
  private requestList: Promise<any>[] = []

  private uploadRequestInstance: IAjax = () => Promise.resolve(true)
  private preVerifyRequestInstance: null | IAjax = () => Promise.resolve(true)

  constructor(options: SliceUploadOptions) {
    this.file = null

    const {
      retryCount = 3,
      retryDelay = 300,
      chunkSize = 1024 ** 2 * 2,
    } = options

    this.chunkSize = chunkSize
    this.retryCount = retryCount
    this.retryDelay = retryDelay
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
    const { url, method, headers = {}, data, timeout = 30000 } = options
  }

  /**
   * 设置上传前验证函数
   * @param request
   * @returns
   */
  setPreVerifyRequest(request: IAjax) {
    return this
  }

  /**
   * 开始上传
   * @returns
   */
  start() {
    if (!this.file)
      throw new Error('请先设置上传文件')
    if (!this.uploadRequestInstance)
      throw new Error('请先设置上传请求函数')
    return this
  }

  cancel() {
    return this
  }
}
