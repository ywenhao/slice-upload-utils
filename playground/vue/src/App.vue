<script setup lang="ts">
import { defineSliceUpload } from '../../../src'

const uploadUtils = defineSliceUpload()

async function handleUploadFile(e: Event) {
  const file = (e.target as HTMLInputElement).files![0]
  uploadUtils
    .setFile(file)
    .setUploadRequest({
      url: 'http://192.168.2.66:10393/mock/f233ab29-8e89-4f8d-ab06-c04e42cea621/slice_upload',
      method: 'POST',
    })
    .start()
  console.log('uploadUtils', uploadUtils)
  // mergeFile(res.fileChunks.map(v => v.chunk), file.name, file.type)
}
</script>

<template>
  <input type="file" @change="handleUploadFile">
</template>
