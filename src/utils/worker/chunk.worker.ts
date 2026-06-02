import type { FileChunk, FileChunkParams } from '../../types'
import { createSha256Hasher, getBlobHash, getBufferHash, getCustomChunkHash } from '../hash'

export async function chunkWorker(params: FileChunkParams) {
  const { chunkSize, file, realChunkHash, preHash: hash } = params

  const chunkTotal = Math.ceil(file.size / chunkSize)

  let fileChunks: FileChunk[] = []
  const preHashHasher = !hash && realChunkHash ? createSha256Hasher() : undefined

  for (let index = 0; index < chunkTotal; index++) {
    const start = index * chunkSize
    const end = start + chunkSize >= file.size ? file.size : start + chunkSize
    const chunk = file.slice(start, end)
    let chunkHash = ''

    if (realChunkHash || preHashHasher) {
      const buffer = await chunk.arrayBuffer()
      preHashHasher?.update(buffer)
      if (realChunkHash) chunkHash = await getBufferHash(buffer)
    }

    fileChunks.push({ chunk, index, chunkHash })
  }

  const preHash = hash || preHashHasher?.digest() || (await getBlobHash(file))

  // compute chunk hash
  if (!realChunkHash)
    fileChunks = fileChunks.map((v, index) => ({
      ...v,
      chunkHash: getCustomChunkHash(preHash, chunkSize, index),
    }))

  return { fileChunks, preHash }
}
