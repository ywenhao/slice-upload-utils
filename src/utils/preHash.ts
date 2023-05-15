import { preHashWorker } from './worker/preHash.worker'
import { getCustomFileHash, getFileHash } from '.'

/**
 * 取得hash值
 * 大文件进行首尾拼接，计算hash值，小文件直接计算hash值
 * @param file 文件
 * @param chunkSize 分片大小
 */
export async function getPreHash(file: File, chunkSize: number) {
  // 小文件直接计算真实hash值
  if (file.size <= chunkSize) {
    const preHash = await getFileHash(file)
    return preHash
  }

  const preFile = getPreFile(file, chunkSize)
  const { hash } = await getPreHashWorker(preFile)
  const preHash = getCustomFileHash(hash, file)
  return preHash
}

export function getPreFile(file: File, chunkSize: number) {
  if (file.size <= chunkSize)
    return file
  const firstFile = file.slice(0, chunkSize)
  const lastFile = file.slice(file.size - chunkSize, file.size)
  const newFile = new File([firstFile, lastFile], file.name, { type: file.type })
  return newFile
}

export function getPreHashWorker(file: File) {
  return preHashWorker({ file })
}
