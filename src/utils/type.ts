export interface FileChunkParams {
  chunkSize: number
  file: File
}

export interface FileChunk {
  chunk: Blob
  index: number
}

export interface FileChunkResult {
  hash: string
  fileName: string
  fileChunks: FileChunk[]
}
