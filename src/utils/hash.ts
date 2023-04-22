import SparkMD5 from 'spark-md5'

/**
 * 计算文件hash
 * @param file 文件
 * @returns
 */
export async function getFileHash(file: File) {
  const spark = new SparkMD5.ArrayBuffer()

  spark.append(await file.arrayBuffer())
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
  return SparkMD5.hash(`${sourceHash}_${file.lastModified}_${file.size}`)
}

/**
 * 计算自定义分片hash
 * @param hash 主文件hash
 * @param chunkSize 分片大小
 * @param index 下标
 * @returns
 */
export function getCustomChunkHash(hash: string, chunkSize: number, index = 0) {
  return SparkMD5.hash(`${hash}_${chunkSize}_${index}`)
}
