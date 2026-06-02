import type { FileChunkParams, FileChunkResult, HashChunksParams } from '../types'
import { getFileHash } from './hash'
import { getPreHash } from './preHash'
import { chunkWorker } from './worker/chunk.worker'

export async function getFileChunk(params: FileChunkParams): Promise<FileChunkResult> {
  // Small file: compute the real hash directly. chunkHash = preHash, file is the chunk
  if (params.file.size <= params.chunkSize) {
    const preHash = params.preHash || (await getFileHash(params.file))
    return {
      preHash,
      fileChunks: [{ chunk: params.file, index: 0, chunkHash: preHash }],
    }
  } else {
    return await getFileChunkWorker(params)
  }
}

/**
 * Get file chunks
 * @param param0
 * @returns
 */
export function getFileChunkWorker(params: FileChunkParams): Promise<FileChunkResult> {
  return chunkWorker(params)
}

/**
 * Get file chunks and hash
 * @param param0
 * @returns
 */
export async function getHashChunks(params: HashChunksParams) {
  const { file, chunkSize, realChunkHash, realPreHash } = params

  let preHash = ''

  if (!(realPreHash && file.size > chunkSize)) preHash = await getPreHash(file, chunkSize)

  // Large file with no preHash provided: compute the real preHash
  const result = await getFileChunk({
    file,
    preHash,
    chunkSize,
    realChunkHash,
  })
  return result
}
