import SparkMD5 from 'spark-md5'
import { createWorkPromise } from './worker/createWorkPromise'

/**
 * 取得hash值
 * 大文件进行首尾拼接，计算hash值，小文件直接计算hash值
 * @param file 文件
 * @param sliceSize 分片大小
 */
export async function getPreHash(file: File, sliceSize: number) {
  const preFile = getPreFile(file, sliceSize)
  const { hash } = await getPreHashWorker(preFile)
  const preHash = SparkMD5.hash(`${hash}_${file.lastModified}_${file.size}`)
  return preHash
}

function getPreFile(file: File, sliceSize: number) {
  if (file.size <= sliceSize * 2)
    return file
  const firstFile = file.slice(0, sliceSize)
  const lastFile = file.slice(file.size - sliceSize, file.size)
  const newFile = new File([firstFile, lastFile], file.name, { type: file.type })
  return newFile
}

function getPreHashWorker(file: File) {
  const workURL = new URL('./worker/preHash.worker.ts', import.meta.url)
  return createWorkPromise<{ file: File }, { hash: string }>(workURL, { file })
}
