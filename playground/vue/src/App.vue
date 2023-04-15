<script setup lang="ts">
import { getFileChunk, sliceDownload } from '../../../src'

async function handleUploadFile(e: Event) {
  const file = (e.target as HTMLInputElement).files![0]
  const chunkSize = 1024 * 1024 * 10
  const workerDoCount = 10
  const chunkCount = Math.ceil(file.size / chunkSize)
  const promiseCount = Math.ceil(chunkCount / workerDoCount)

  const fileChunk = (file: File) => getFileChunk({ file, chunkSize })
  console.time('chunk')
  const promiseList = Array(promiseCount).fill(false).map((_, i) => fileChunk(file.slice(i * chunkSize * workerDoCount, (i + 1) * chunkSize * workerDoCount) as File))

  const res = await Promise.all(promiseList)
  const fileChunks = res.map(v => v.fileChunks).reduce((pre, cur, index) => [...pre, ...(index ? cur.map(v => ({ ...v, index: v.index + pre.length })) : cur)], [])
  console.log({ file, fileChunks })
  console.timeEnd('chunk')

  sliceDownload(fileChunks.map(v => v.chunk), file.name, file.type)
}
</script>

<template>
  <input type="file" @change="handleUploadFile">
</template>
