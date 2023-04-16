<script setup lang="ts">
import { getFileChunk } from '../../../src'

async function handleUploadFile(e: Event) {
  const file = (e.target as HTMLInputElement).files![0]
  const chunkSize = 1024 * 1024 * 10

  console.time('chunk')
  const res = await getFileChunk({
    file,
    chunkSize,
  })
  console.log({ file, res })
  console.timeEnd('chunk')

  // sliceDownload(res.fileChunks.map(v => v.chunk), file.name, file.type)
}
</script>

<template>
  <input type="file" @change="handleUploadFile">
</template>
