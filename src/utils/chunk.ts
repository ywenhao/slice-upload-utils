import type { FileChunkParams, FileChunkResult } from './type'

/**
 *  获取文件切片
 * @param params
 * @returns
 */
export function getFileChunk(params: FileChunkParams): Promise<FileChunkResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./chunk.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event) => {
      resolve(event.data)
    }
    worker.onerror = (event) => {
      reject(event)
    }
    worker.postMessage(params)
  })
}
