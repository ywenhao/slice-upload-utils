import SparkMD5 from 'spark-md5'
import type { FileChunk, FileChunkParams } from '../../types'

self.onmessage = (e) => {
  const { chunkSize, file, realChunkHash, preHash: hash } = e.data as FileChunkParams

  const chunks = Math.ceil(file.size / chunkSize)

  let fileChunks: FileChunk[] = []
  let preHashSpark: SparkMD5.ArrayBuffer
  let chunkSpark: SparkMD5.ArrayBuffer

  if (!hash)
    preHashSpark = new SparkMD5.ArrayBuffer()

  if (realChunkHash)
    chunkSpark = new SparkMD5.ArrayBuffer()

  async function getFileChunk() {
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

    const preHash = hash || preHashSpark.end()

    // 计算分片hash
    if (!realChunkHash)
      fileChunks = fileChunks.map((v, index) => ({ ...v, chunkHash: SparkMD5.hash(`${hash}_${chunkSize}_${index}`) }))

    self.postMessage({ fileChunks, preHash })
    self.close()
  }

  getFileChunk()
}
