import type { FileChunkParams, FileChunkResult, HashChunksParams } from '../types'
import { createWorkPromise } from './worker/createWorkPromise'
import { getFileHash, getPreHash } from '.'

export async function getFileChunk(params: FileChunkParams): Promise<FileChunkResult> {
  // 小文件直接计算真实hash值, chunkHash = preHash, file就是chunk
  if (params.file.size <= params.chunkSize) {
    const preHash = params.preHash || await getFileHash(params.file)
    return {
      preHash,
      fileChunks: [{ chunk: params.file, index: 0, chunkHash: preHash }],
    }
  }
  else {
    return await getFileChunkWorker(params)
  }
}

/**
 * 获取文件分片
 * @param param0
 * @returns
 */
export function getFileChunkWorker(params: FileChunkParams): Promise<FileChunkResult> {
  const workURL = new URL('./worker/chunk.worker.ts', import.meta.url)
  return createWorkPromise<FileChunkParams, FileChunkResult>(workURL, params)
}

/**
 * 获取文件分片,hash
 * @param param0
 * @returns
 */
export async function getHashChunks(params: HashChunksParams) {
  const { file, chunkSize, realChunkHash, realPreHash } = params

  let preHash = ''

  if (!(realPreHash && file.size > chunkSize))
    preHash = await getPreHash(file, chunkSize)

  // 大文件，没有preHash传入，则计算真实preHash值
  const result = await getFileChunk({
    file,
    preHash,
    chunkSize,
    realChunkHash,
  })
  return result
}
