import type { FileChunkParams, FileChunkResult } from '../types'
import { createWorkPromise } from './worker/createWorkPromise'

/**
 * 获取文件分片
 * @param param0
 * @returns
 */
export async function getFileChunkWorker(params: FileChunkParams): Promise<FileChunkResult> {
  const workURL = new URL('./worker/chunk.worker.ts', import.meta.url)
  return createWorkPromise<FileChunkParams, FileChunkResult>(workURL, params)
}
