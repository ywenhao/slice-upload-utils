import type { SliceUploadOptions } from '.'

export class SliceUpload {
  private file: File
  private chunkSize: number
  private retryCount: number
  private retryDelay: number

  constructor(options: SliceUploadOptions) {
    const { file, chunkSize = 1024 ** 2 * 2, retryCount = 3, retryDelay = 300 } = options
    this.file = file
    this.chunkSize = chunkSize
    this.retryCount = retryCount
    this.retryDelay = retryDelay
  }

  start() {}
}
