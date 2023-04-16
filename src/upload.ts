import type { SliceUploadOptions } from '.'

export type IAjax = (params: { chunk: File; index: number; all: number; md5: string }) => Promise<boolean | void>

export interface RequestOptions {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  data?: any
  timeout?: number
}

export class SliceUpload {
  private file: File
  private chunkSize: number
  private requestCount: number
  private retryDelay: number

  private requestInstance: IAjax = () => Promise.resolve(true)

  private requestList: Promise<any>[] = []

  constructor(options: SliceUploadOptions) {
    const { file, chunkSize = 1024 ** 2 * 2, requestCount = 3, retryDelay = 300 } = options
    this.file = file
    this.chunkSize = chunkSize
    this.requestCount = requestCount
    this.retryDelay = retryDelay
  }

  async setAxios(request: IAjax) {
    this.requestInstance = request
    return this
  }

  request(options: RequestOptions) {
    const { url, method, headers = {}, data, timeout = 30000 } = options
  }

  start() {}

  cancel() {}
}
