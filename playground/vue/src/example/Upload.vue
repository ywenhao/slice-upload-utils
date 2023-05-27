<script setup lang="ts">
import { ref } from 'vue'
import type { UploadParams } from '../../../../src'
import { useSliceUpload } from '../../../../src'
import ChunkBox from '../components/ChunkBox.vue'

// 上传的文件
const uploadFile = ref<File>()

const { instance, chunks, progress, status, start, pause, cancel } = useSliceUpload({
  file: uploadFile,
  request,
  // onFinish,
  // preVerifyRequest,
})

// 预检请求 用于断点续传
// async function preVerifyRequest(params: PreVerifyUploadParams) {
// const { preHash, filename, chunkSize, chunkTotal } = params
// const result = await axios.post('/preVerify', params)
// return result.data // 返回已上传的分片chunkHash[]
// result.data 为 true，表示已上传所有分片
// result.data 为 false，表示一个分片都没有上传
// }

// 上传请求函数
async function request(params: UploadParams) {
  // 上传请求data数据处理
  const data = new FormData()
  Object.keys(params).forEach((key) => {
    let item = params[key as keyof typeof params]
    item = typeof item === 'number' ? String(item) : item
    data.append(key, item)
  })

  // 单条预检请求
  // const check = await axios.post('/check', {preHash: params.preHash, chunkHash: params.chunkHash})
  // if (check.data === true) {
  //   return true
  // }

  const result = await instance.ajaxRequest({
    data,
    url: 'https://console-mock.apipost.cn/mock/f233ab29-8e89-4f8d-ab06-c04e42cea621/slice_upload',
  })
  return result.code === 200
}

// function onFinish(params: UploadFinishParams) {
// console.log('finish', params)
// 通知后端合并文件
// axios.post('/merge', params)
// }

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
