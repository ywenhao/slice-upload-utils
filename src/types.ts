export interface FileChunkParams {
  /**
   * 上传源文件
   */
  file: File
  /**
   * 前置hash,预上传文件hash
   */
  preHash?: string
  /**
   * 是否计算前置真实hash
   */
  realChunkHash: boolean
  /**
   * 分片大小
   */
  chunkSize: number
}

export interface FileChunk {
  /**
   * 分片
   */
  chunk: Blob
  /**
   * 下标
   */
  index: number
  /**
   * 分片hash
   */
  chunkHash: string
}

export interface FileChunkResult {
  /**
   * 前置hash,预上传文件hash
   */
  preHash: string
  /**
   * 分片list
   */
  fileChunks: FileChunk[]
}

export interface SliceUploadOptions {
  /**
   * 上传的文件
   */
  file?: File
  /**
   * 分片大小
   * @default 1024 * 1024 * 2
   */
  chunkSize?: number
  /**
   * 请求失败后，重试次数
   *
   * @default 3
   */
  retryCount?: number
  /**
   * 请求失败后，重试间隔时间
   * @default 300
   */
  retryDelay?: number
  /**
   * 计算整个文件的hash，开启后比较耗时间
   *
   * @default false
   */
  realPreHash?: boolean
  /**
   * 计算分片文件的hash，开启后比较耗时间
   *
   * @default false
   */
  realChunkHash?: boolean
}

/**
 * 分片hash参数
 */
export interface HashChunksParams {
  file: File
  chunkSize: number
  realChunkHash: boolean
  realPreHash: boolean
}

export type SliceUploadStatus = 'ready' | 'uploading' | 'success' | 'error'

export interface SliceUploadItem extends FileChunk {
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  totalSize: number
  uploadedSize: number
  request: () => Promise<any>
}
