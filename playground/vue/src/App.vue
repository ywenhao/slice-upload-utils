<script setup lang="ts">
import { getFileChunkWorker, getPreHash } from '../../../src'

async function handleUploadFile(e: Event) {
  const file = (e.target as HTMLInputElement).files![0]
  const chunkSize = 1024 * 1024 * 10

  const realPreHash = false
  const realChunkHash = false
  let preHash = ''

  if (!realPreHash) {
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
    realChunkHash,
  })
  console.log({ file, chunks })
  console.timeEnd('chunks')

  // mergeFile(res.fileChunks.map(v => v.chunk), file.name, file.type)
}
</script>

<template>
  <input type="file" @change="handleUploadFile">
</template>
