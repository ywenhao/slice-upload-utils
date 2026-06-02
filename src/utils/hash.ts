import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

const DEFAULT_HASH_CHUNK_SIZE = 1024 * 1024 * 2
const NATIVE_HASH_MAX_SIZE = 1024 * 1024 * 32
const HASH_ALGORITHM = 'SHA-256'

export interface Sha256Hasher {
  update: (input: BufferSource) => void
  digest: () => string
}

/**
 * 计算文件hash
 * @param file 文件
 * @returns
 */
export async function getFileHash(file: File | Blob, chunkSize = DEFAULT_HASH_CHUNK_SIZE) {
  if (shouldUseNativeHash(file)) return await getNativeHash(await file.arrayBuffer())

  const hash = createSha256Hasher()
  const chunkTotal = Math.ceil(file.size / chunkSize)
  for (let index = 0; index < chunkTotal; index++) {
    const start = index * chunkSize
    const end = Math.min(start + chunkSize, file.size)
    hash.update(await file.slice(start, end).arrayBuffer())
  }
  return hash.digest()
}

export async function getBlobHash(blob: Blob) {
  if (shouldUseNativeHash(blob)) return await getNativeHash(await blob.arrayBuffer())
  return await getFileHash(blob)
}

export async function getBufferHash(buffer: BufferSource) {
  if (shouldUseNativeBufferHash(buffer)) return await getNativeHash(buffer)
  return getBytesHash(toUint8Array(buffer))
}

export function getBytesHash(bytes: Uint8Array) {
  return bytesToHex(sha256(bytes))
}

export function getTextHash(text: string) {
  return getBytesHash(utf8ToBytes(text))
}

export function createSha256Hasher(): Sha256Hasher {
  const hash = sha256.create()
  return {
    update(input) {
      hash.update(toUint8Array(input))
    },
    digest() {
      return bytesToHex(hash.digest())
    },
  }
}

/**
 * 计算自定义文件hash
 * @param sourceHash 分片计算的hash
 * @param file 文件
 * @returns
 */
export function getCustomFileHash(sourceHash: string, file: File) {
  return getTextHash(`${sourceHash}_${file.size}`)
}

/**
 * 计算自定义分片hash
 * @param hash 主文件hash
 * @param chunkSize 分片大小
 * @param index 下标
 * @returns
 */
export function getCustomChunkHash(hash: string, chunkSize: number, index = 0) {
  return getTextHash(`${hash}_${chunkSize}_${index}`)
}

function hasNativeSubtleCrypto() {
  return typeof crypto !== 'undefined' && !!crypto.subtle?.digest
}

function shouldUseNativeHash(blob: Blob) {
  return hasNativeSubtleCrypto() && blob.size <= NATIVE_HASH_MAX_SIZE
}

function shouldUseNativeBufferHash(buffer: BufferSource) {
  return hasNativeSubtleCrypto() && getBufferByteLength(buffer) <= NATIVE_HASH_MAX_SIZE
}

function getBufferByteLength(buffer: BufferSource) {
  return buffer.byteLength
}

function toUint8Array(input: BufferSource) {
  if (ArrayBuffer.isView(input))
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  return new Uint8Array(input)
}

async function getNativeHash(buffer: BufferSource) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest(HASH_ALGORITHM, buffer)))
}
