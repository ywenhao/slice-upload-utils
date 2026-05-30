<script setup lang="ts">
import { ref } from 'vue'
import type { PreVerifyUploadParams, UploadFinishParams, UploadParams } from '../../../../src'
import { useSliceUpload } from '../../../../src/vue'
import ChunkBox from '../components/ChunkBox.vue'

const chunkSize = 1024 ** 2 * 2
// 上传的文件
const uploadFile = ref<File>()

const { chunks, progress, status, start, pause, cancel } = useSliceUpload({
  chunkSize,
  file: uploadFile,
  request,
  onFinish,
  preVerifyRequest,
})

// 预检请求 用于断点续传
async function preVerifyRequest(params: PreVerifyUploadParams) {
  const result = await fetch('/api/upload/verify', {
    body: JSON.stringify(params),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  }).then((res) => res.json())

  return result.data
}

// 上传请求函数
async function request(params: UploadParams) {
  // 上传请求data数据处理
  const data = new FormData()
  const { ajaxRequest, ...formParams } = params
  data.append('chunkSize', String(chunkSize))
  Object.keys(formParams).forEach((key) => {
    let item = formParams[key as keyof typeof formParams]
    item = typeof item === 'number' ? String(item) : item
    if (item === undefined || item === null) return
    data.append(key, item)
  })

  // 单条预检请求
  // const check = await axios.post('/check', {preHash: params.preHash, chunkHash: params.chunkHash})
  // if (check.data === true) {
  //   return true
  // }

  const result = await ajaxRequest<{ code: number }>({
    data,
    url: '/api/upload/chunk',
  })
  return result.code === 200
}

async function onFinish(params: UploadFinishParams) {
  // 通知后端合并文件
  await fetch('/api/upload/merge', {
    body: JSON.stringify(params),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
}

function handleSelectFile(file: File) {
  uploadFile.value = file
}
</script>

<template>
  <ChunkBox
    is-upload
    :chunks="chunks"
    :progress="progress"
    :status="status"
    @select-file="handleSelectFile"
    @start="start"
    @pause="pause"
    @cancel="cancel"
  />
</template>
