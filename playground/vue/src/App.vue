<script setup lang="ts">
import { getFileChunk } from '../../../src/utils/chunk'

async function handleUploadFile(e: Event) {
  const file = (e.target as HTMLInputElement).files![0]
  console.time('chunk')
  const fileChunk = await getFileChunk({ file, chunkSize: 1024 * 1024 * 10 })
  console.timeEnd('chunk')
  console.log({ file, fileChunk })
}
</script>

<template>
  <input type="file" @change="handleUploadFile">
</template>
