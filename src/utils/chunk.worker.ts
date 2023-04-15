import SparkMD5 from 'spark-md5'
import type { FileChunk, FileChunkParams } from './type'

self.onmessage = (e) => {
  const { chunkSize, file } = e.data as FileChunkParams
  const spark = new SparkMD5.ArrayBuffer()
  const chunks = Math.ceil(file.size / chunkSize)
  const fileChunks: FileChunk[] = []

  async function getHash() {
    for (let index = 0; index < chunks; index++) {
      const start = index * chunkSize
      const end = start + chunkSize >= file.size ? file.size : start + chunkSize
      const chunk = file.slice(start, end)
      spark.append(await chunk.arrayBuffer())
      fileChunks.push({ chunk, index })
    }

    const hash = spark.end()
    self.postMessage({ fileChunks, hash, fileName: file.name })
    self.close()
  }

  getHash()
}
