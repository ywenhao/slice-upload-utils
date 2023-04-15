import ChunkWorker from './chunk.worker?worker'
import type { FileChunkParams, FileChunkResult } from './type'

export function getFileChunk(params: FileChunkParams): Promise<FileChunkResult> {
  return new Promise((resolve, reject) => {
    const worker = new ChunkWorker()
    worker.onmessage = (event) => {
      resolve(event.data)
    }
    worker.onerror = (event) => {
      reject(event)
    }
    worker.postMessage(params)
  })
}
