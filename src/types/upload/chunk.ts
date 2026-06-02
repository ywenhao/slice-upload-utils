import type { RequestStatus } from '../../utils/ajax'

export interface FileChunkParams {
  /**
   * Source file to upload
   */
  file: File
  /**
   * Pre-hash, the hash of the file before upload
   */
  preHash?: string
  /**
   * Whether to compute the real pre-hash
   */
  realChunkHash: boolean
  /**
   * Chunk size, in bytes
   */
  chunkSize: number
}

export interface FileChunk {
  /**
   * Chunk
   */
  chunk: Blob
  /**
   * Index
   */
  index: number
  /**
   * Chunk hash
   */
  chunkHash: string
}

export interface FileChunkResult {
  /**
   * Pre-hash, the hash of the file before upload
   */
  preHash: string
  /**
   * Chunk list
   */
  fileChunks: FileChunk[]
}

export interface SliceUploadOptions {
  /**
   * File to upload
   */
  file?: File
  /**
   * Chunk size, in bytes
   * @default 1024 * 1024 * 2 bytes
   */
  chunkSize?: number
  /**
   * Concurrent upload count
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
  /**
   * Compute the hash of the whole file; enabling this is relatively time-consuming
   * @default false
   */
  realPreHash?: boolean
  /**
   * Compute the hash of each chunk; enabling this is relatively time-consuming
   * @default false
   */
  realChunkHash?: boolean
}

/**
 * Chunk hash parameters
 */
export interface HashChunksParams {
  file: File
  /**
   * Chunk size, in bytes
   */
  chunkSize: number
  realChunkHash: boolean
  realPreHash: boolean
}

export type SliceUploadStatus = Exclude<RequestStatus, 'downloading'>
export type SliceDownloadStatus = Exclude<RequestStatus, 'uploading'>
