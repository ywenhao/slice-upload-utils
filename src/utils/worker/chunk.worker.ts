import SparkMD5 from 'spark-md5'
import type { FileChunk, FileChunkParams } from '../../types'
import { getCustomChunkHash } from '../hash'

export async function chunkWorker(params: FileChunkParams) {
  const { chunkSize, file, realChunkHash, preHash: hash } = params

  const chunkTotal = Math.ceil(file.size / chunkSize)

  let fileChunks: FileChunk[] = []
  let preHashSpark: SparkMD5.ArrayBuffer | undefined

  if (!hash) preHashSpark = new SparkMD5.ArrayBuffer()

  for (let index = 0; index < chunkTotal; index++) {
    const start = index * chunkSize
    const end = start + chunkSize >= file.size ? file.size : start + chunkSize
    const chunk = file.slice(start, end)

    let chunkHash = ''
    if (realChunkHash || preHashSpark) {
      const arrayBuffer = await chunk.arrayBuffer()
      if (preHashSpark) preHashSpark.append(arrayBuffer)
      if (realChunkHash) {
        const chunkSpark = new SparkMD5.ArrayBuffer()
        chunkSpark.append(arrayBuffer)
        chunkHash = chunkSpark.end()
      }
    }

    fileChunks.push({ chunk, index, chunkHash })
  }

  const preHash = hash || preHashSpark!.end()

  // 计算分片hash
  if (!realChunkHash)
    fileChunks = fileChunks.map((v, index) => ({
      ...v,
      chunkHash: getCustomChunkHash(preHash, chunkSize, index),
    }))

  return { fileChunks, preHash }
}
