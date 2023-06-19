<script lang="ts" setup>
import type { DownloadStatus, UploadStatus } from '../../../../src'
import type { RequestStatus } from '../../../../src/utils/ajax'
import DoneImg from '../done.svg'

interface Chunks {
  index: number
  progress: number
  status: RequestStatus
}

defineProps<{
  isUpload?: boolean
  chunks: Chunks[]
  progress: number
  status: UploadStatus | DownloadStatus
}>()

const emit = defineEmits<{
  (event: 'selectFile', file: File): void
  (event: 'start'): void
  (event: 'pause'): void
  (event: 'cancel'): void
}>()

function handleSelectFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  file && emit('selectFile', file)
}
</script>

<template>
  <div class="box">
    <input v-if="isUpload" type="file" @change="handleSelectFile">
    <div class="actions">
      <button @click="emit('start')">
        开始
      </button>
      <button class="primary" @click="emit('pause')">
        暂停
      </button>
      <button class="danger" @click="emit('cancel')">
        取消
      </button>
    </div>
    <div>总进度：{{ Math.ceil(progress) }} {{ status }}</div>
    <div class="chunk-box">
      <div v-for="item in chunks" :key="item.index" class="chunk-item">
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

.chunk-box {
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

.chunk-item {
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
