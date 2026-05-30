import SparkMD5 from 'spark-md5'

const DEFAULT_HASH_CHUNK_SIZE = 1024 * 1024 * 2

/**
 * 计算文件hash
 * @param file 文件
 * @param chunkSize 分片大小，单位：字节
 * @returns
 */
export async function getFileHash(file: File | Blob, chunkSize = DEFAULT_HASH_CHUNK_SIZE) {
  const spark = new SparkMD5.ArrayBuffer()
  const chunkTotal = Math.ceil(file.size / chunkSize)

  for (let index = 0; index < chunkTotal; index++) {
    const start = index * chunkSize
    const end = Math.min(start + chunkSize, file.size)
    spark.append(await file.slice(start, end).arrayBuffer())
  }

  const hash = spark.end()
  return hash
}

/**
 * 计算自定义文件hash
 * @param sourceHash 分片计算的hash
 * @param file 文件
 * @returns
 */
export function getCustomFileHash(sourceHash: string, file: File) {
  return SparkMD5.hash(`${sourceHash}_${file.size}`)
}

/**
 * 计算自定义分片hash
 * @param hash 主文件hash
 * @param chunkSize 分片大小，单位：字节
 * @param index 下标
 * @returns
 */
export function getCustomChunkHash(hash: string, chunkSize: number, index = 0) {
  return SparkMD5.hash(`${hash}_${chunkSize}_${index}`)
}
