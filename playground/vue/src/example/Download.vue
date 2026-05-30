<script setup lang="ts">
import type { DownloadParams } from '../../../../src'
import { useSliceDownload } from '../../../../src/vue'
import ChunkBox from '../components/ChunkBox.vue'

const { chunks, progress, status, start, pause, cancel, setFileOptions } = useSliceDownload({
  request,
  // onFinish,
})

const filename = 'mp4.zip'

// 下载请求函数
async function request(params: DownloadParams) {
  const result = await params.ajaxRequest<Blob>({
    url: `/api/files/${encodeURIComponent(params.filename)}/content`,
  })
  return result
}

async function handleStart() {
  const meta = await fetch(`/api/files/${encodeURIComponent(filename)}/meta`)
    .then((res) => res.json())
    .then((res) => res.data)
  setFileOptions({ filename: meta.filename, fileSize: meta.fileSize, fileType: meta.fileType })
  start()
}

// function onFinish(params: DownloadFinishParams) {
// console.log('finish', params)
// }
</script>

<template>
  <ChunkBox
    :chunks="chunks"
    :progress="progress"
    :status="status"
    @start="handleStart"
    @pause="pause"
    @cancel="cancel"
  />
</template>
