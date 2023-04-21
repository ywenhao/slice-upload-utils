<script setup lang="ts">
import { getFileChunkWorker, getPreHash } from '../../../src'

async function handleUploadFile(e: Event) {
  const file = (e.target as HTMLInputElement).files![0]
  const chunkSize = 1024 * 1024 * 10

  const preRealHash = false
  const chunkRealHash = false
  let preHash = ''

  if (!preRealHash) {
    console.time('pre_hash')
    preHash = await getPreHash(file, 1024 * 1024 * 2)
    console.log(preHash)
    console.timeEnd('pre_hash')
  }

  console.time('chunks')
  const chunks = await getFileChunkWorker({
    file,
    preHash,
    chunkSize,
    chunkRealHash,
  })
  console.log({ file, chunks })
  console.timeEnd('chunks')

  // mergeFile(res.fileChunks.map(v => v.chunk), file.name, file.type)
}
</script>

<template>
  <input type="file" @change="handleUploadFile">
</template>
