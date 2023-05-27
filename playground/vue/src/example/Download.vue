<script setup lang="ts">
import type { DownloadParams } from '../../../../src'
import { useSliceDownload } from '../../../../src'
import ChunkBox from '../components/ChunkBox.vue'

const { instance, chunks, progress, status, start, pause, cancel, setFileOptions } = useSliceDownload({
  request,
  // onFinish,
})

const filename = 'dance.mp4'
// const fileType = 'video/mp4'

// 下载请求函数
async function request(params: DownloadParams) {
  // 下载请求data数据处理
  const data = new FormData()
  Object.keys(params).forEach((key) => {
    let item = params[key as keyof typeof params]
    item = typeof item === 'number' ? String(item) : item
    data.append(key, item)
  })

  const result = await instance.ajaxRequest({
    data: { ...params, filename },
    url: `http://localhost:10010/download/${filename}`,
  })
  return result
}

async function handleStart() {
  const fileSize = await fetch(`http://localhost:10010/size/${filename}`).then(res => res.json()).then(res => +res.data)
  setFileOptions({ filename, fileSize })
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
