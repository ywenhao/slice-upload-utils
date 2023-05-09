<script setup lang="ts">
import { defineSliceUpload } from '../../../src'

const uploadUtils = defineSliceUpload()

async function handleUploadFile(e: Event) {
  const file = (e.target as HTMLInputElement).files![0]
  uploadUtils
    .setFile(file)
    .setUploadRequest(async (params) => {
      const data = new FormData()
      Object.keys(params).forEach((key) => {
        let item = params[key as keyof typeof params]
        item = typeof item === 'number' ? String(item) : item
        data.append(key, item)
      })

      const result = await uploadUtils.ajaxRequest({
        data,
        url: 'https://console-mock.apipost.cn/mock/f233ab29-8e89-4f8d-ab06-c04e42cea621/slice_upload',
        // url: 'https://console-mock.apipost.cn/',
      })
      return result.code === 200
    })
    .start()

  console.log('uploadUtils', uploadUtils)
  // mergeFile(res.fileChunks.map(v => v.chunk), file.name, file.type)
}

function handlePause() {
  uploadUtils.pause()
  console.log(uploadUtils.getData())
}
</script>

<template>
  <div class="box">
    <input type="file" @change="handleUploadFile">
    <div class="actions">
      <button @click="() => uploadUtils.start()">
        开始
      </button>
      <button @click="() => uploadUtils.cancel()">
        取消
      </button>
      <button @click="handlePause">
        暂停
      </button>
    </div>
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
</style>
