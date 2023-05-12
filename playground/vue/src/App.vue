<script setup lang="ts">
import { ref } from 'vue'
import type { UploadParams } from '../../../src'
import { useSliceUpload } from '../../../src'
import DoneImg from './done.svg'

// 上传的文件
const uploadFile = ref<File>()

const { instance, chunks, progress, start, pause, cancel, status } = useSliceUpload({
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
    // url: 'https://console-mock.apipost.cn/',
  })
  return result.code === 200
}

// function onFinish(params: UploadFinishParams) {
// console.log('finish', params)
// 通知后端合并文件
// axios.post('/merge', params)
// }

async function handleUploadFile(e: Event) {
  const file = (e.target as HTMLInputElement).files![0]
  uploadFile.value = file
  // mergeFile(res.fileChunks.map(v => v.chunk), file.name, file.type)
}

function handlePause() {
  pause()
}
</script>

<template>
  <div class="box">
    <input type="file" @change="handleUploadFile">
    <div class="actions">
      <button @click="start">
        开始
      </button>
      <button class="pause" @click="handlePause">
        暂停
      </button>
      <button class="cancel" @click="cancel">
        取消
      </button>
    </div>
    <div>总进度：{{ Math.ceil(progress) }} {{ status }}</div>
    <div class="upload-box">
      <div v-for="item in chunks" :key="item.chunkHash" class="chunk-box">
        <div class="chunk">
          <div class="progress" :style="{ height: `${item.progress.toFixed(2)}%` }" />
          <img v-show="item.status === 'success'" class="icon-done" :src="DoneImg" alt="">
        </div>
        <div class="index">
          {{ item.index }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.box {
  width: 100%;
  margin-top: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.box .actions {
  margin-top: 20px;
  column-gap: 10px;
  display: flex;
}

button {
  margin: 0;
  line-height: 1;
  padding: 0 20px;
  height: 36px;
  font-size: 14px;
  border-radius: 3px;
  color: #fff;
  background-color: rgb(46, 125, 50);
  box-shadow: rgba(0, 0, 0, 0.2) 0px 3px 1px -2px, rgba(0, 0, 0, 0.14) 0px 2px 2px 0px, rgba(0, 0, 0, 0.12) 0px 1px 5px 0px;
  white-space: nowrap;
  outline: none;
  position: relative;
  align-items: center;
  justify-content: center;
  user-select: none;
  text-align: center;
  cursor: pointer;
  text-decoration: none;
  border: none;
  transition: transform 250ms, background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, border-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
}

button:hover {
  background-color: rgb(27, 94, 32);
  box-shadow: rgba(0, 0, 0, 0.2) 0px 2px 4px -1px, rgba(0, 0, 0, 0.14) 0px 4px 5px 0px, rgba(0, 0, 0, 0.12) 0px 1px 10px 0px;
}

button:active {
  transform: scale(0.96);
}

.cancel {
  background-color: rgb(211, 47, 47);
}

.cancel:hover {
  background-color: rgb(169 0 0);
}

.pause {
  background-color: rgb(0, 99, 204);
}

.pause:hover {
  background-color: rgb(0 75 155);
}

.upload-box {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  column-gap: 10px;
  row-gap: 10px;
  padding: 10px;
  border: 1px solid #ccc;
  width: 845px;
  height: 400px;
  overflow-y: auto;
}

.chunk-box {
  width: 50px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.chunk {
  width: 100%;
  height: 50px;
  position: relative;
  border: 1px solid #ccc;
  border-radius: 5px;
}

.chunk .progress {
  width: 100%;
  background-color: #ccc;
  position: absolute;
  bottom: 0;
  left: 0;
}

.chunk .icon-done {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}

.chunk-box .index {
  margin-top: 10px;
}
</style>
