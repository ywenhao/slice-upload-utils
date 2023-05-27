<script setup lang="ts">
import type { DownloadParams } from '../../../../src'
import { useSliceDownload } from '../../../../src'
import ChunkBox from '../components/ChunkBox.vue'

const { instance, chunks, progress, status, start, pause, cancel, setFileOptions } = useSliceDownload({
  request,
  // onFinish,
})

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
    data: { ...params, filename: '故里逢春.mp4' },
    url: 'http://localhost:10010/download/故里逢春.mp4',
  })
  return result
}

async function handleStart() {
  const fileSize = await fetch('http://localhost:10010/size/故里逢春.mp4').then(res => res.json()).then(res => +res.data)
  setFileOptions({ filename: '故里逢春.mp4', fileSize, fileType: 'video/mp4' })
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
