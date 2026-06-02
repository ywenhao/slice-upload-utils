import { getCustomFileHash, getFileHash } from './hash'
import { preHashWorker } from './worker/preHash.worker'

/**
 * Get the hash value.
 * For large files, concatenate the head, middle, and tail to compute the hash;
 * for small files, compute the hash directly.
 * @param file file
 * @param chunkSize chunk size, in bytes
 */
export async function getPreHash(file: File, chunkSize: number) {
  // Small file: compute the real hash directly
  if (file.size <= chunkSize) {
    const preHash = await getFileHash(file)
    return preHash
  }

  const preFile = getPreFile(file, chunkSize)
  const { hash } = await getPreHashWorker(preFile)
  const preHash = getCustomFileHash(hash, file)
  return preHash
}

/**
 * Get the file segment used for sampled hashing
 * @param file file
 * @param chunkSize chunk size, in bytes
 */
export function getPreFile(file: File, chunkSize: number) {
  if (file.size <= chunkSize) return file
  const size = 500 * 1024
  const mid = Math.ceil(file.size / 2)
  const last = file.size - size
  const firstFile = file.slice(0, size)
  const midFile = file.slice(mid, mid + size)
  const lastFile = file.slice(last, file.size)
  const newFile = new File([firstFile, midFile, lastFile], file.name, { type: file.type })
  return newFile
}

export function getPreHashWorker(file: File) {
  return preHashWorker({ file })
}
