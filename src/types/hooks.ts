import type { SliceDownloadStatus, SliceUploadStatus } from './upload/chunk'

export interface SliceUploadChunk {
  status: SliceUploadStatus
  progress: number
  chunkHash: string
  index: number
}

export interface SliceDownloadChunk {
  status: SliceDownloadStatus
  progress: number
  start: number
  end: number
  index: number
}
