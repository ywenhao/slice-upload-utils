<script setup lang="ts">
import { defineSliceUpload } from '../../../src'

const uploadUtils = defineSliceUpload()

async function handleUploadFile(e: Event) {
  const file = (e.target as HTMLInputElement).files![0]
  uploadUtils
    .setFile(file)
    .start()
  console.log('uploadUtils', uploadUtils)
  // mergeFile(res.fileChunks.map(v => v.chunk), file.name, file.type)
}
</script>

<template>
  <input type="file" @change="handleUploadFile">
</template>
