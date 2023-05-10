<script setup lang="ts">
import { ref } from 'vue'
import type { UploadParams } from '../../../src'
import { useSliceUpload } from '../../../src'

const uploadFile = ref<File>()

const { instance, progress, start, pause, cancel } = useSliceUpload({
  file: uploadFile,
  request,
})

async function request(params: UploadParams) {
  const data = new FormData()
  Object.keys(params).forEach((key) => {
    let item = params[key as keyof typeof params]
    item = typeof item === 'number' ? String(item) : item
    data.append(key, item)
  })

  const result = await instance.ajaxRequest({
    data,
    url: 'https://console-mock.apipost.cn/mock/f233ab29-8e89-4f8d-ab06-c04e42cea621/slice_upload',
    // url: 'https://console-mock.apipost.cn/',
  })
  return result.code === 200
}

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
    <div>进度：{{ progress }}</div>
  </div>
</template>

<style scoped>
.box {
  width: 100%;
  height: 80vh;
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
</style>
