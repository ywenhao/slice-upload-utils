export interface FileChunkParams {
  file: File
  chunkSize: number
}

export interface FileChunk {
  chunk: Blob
  index: number
}

export interface FileChunkResult {
  hash: string
  fileChunks: FileChunk[]
}

export interface SliceUploadOptions {
  file: File
  chunkSize?: number
  retryCount?: number
  retryDelay?: number
}
