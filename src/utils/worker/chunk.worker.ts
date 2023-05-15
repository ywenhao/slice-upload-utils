import SparkMD5 from 'spark-md5'
import type { FileChunk, FileChunkParams } from '../../types'
import { getCustomChunkHash } from '..'

export async function chunkWorker(params: FileChunkParams) {
  const { chunkSize, file, realChunkHash, preHash: hash } = params

  const chunks = Math.ceil(file.size / chunkSize)

  let fileChunks: FileChunk[] = []
  let preHashSpark: SparkMD5.ArrayBuffer | undefined
  let chunkSpark: SparkMD5.ArrayBuffer | undefined

  if (!hash)
    preHashSpark = new SparkMD5.ArrayBuffer()

  if (realChunkHash)
    chunkSpark = new SparkMD5.ArrayBuffer()

  for (let index = 0; index < chunks; index++) {
    const start = index * chunkSize
    const end = start + chunkSize >= file.size ? file.size : start + chunkSize
    const chunk = file.slice(start, end)
    const arrayBuffer = await chunk.arrayBuffer()

    // 计算前值hash
    if (!hash && preHashSpark)
      preHashSpark.append(arrayBuffer)

    // 计算分片hash
    let chunkHash = ''
    if (realChunkHash && chunkSpark) {
      chunkSpark.append(arrayBuffer)
      chunkHash = chunkSpark.end()
    }

    fileChunks.push({ chunk, index, chunkHash })
  }

  const preHash = hash || preHashSpark!.end()

  // 计算分片hash
  if (!realChunkHash)
    fileChunks = fileChunks.map((v, index) => ({ ...v, chunkHash: getCustomChunkHash(preHash, chunkSize, index) }))

  return { fileChunks, preHash }
}
