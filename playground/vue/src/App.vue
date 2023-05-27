<script setup lang="ts">
import { computed, ref } from 'vue'
import Upload from './example/Upload.vue'
import Download from './example/Download.vue'

const active = ref(0)
const title = computed(() => active.value === 1 ? '下载' : '上传')
const btnText = computed(() => active.value === 0 ? '下载' : '上传')
</script>

<template>
  <div class="app-box">
    <button class="view-btn" @click="active = active === 1 ? 0 : 1">
      查看{{ btnText }}示例
    </button>
    <h2 class="title">
      {{ title }}示例
    </h2>
    <Upload v-if="active === 0" />
    <Download v-else />
  </div>
</template>

<style scoped>
.app-box {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.title {
  margin-top: 20px;
  text-align: center;
}

.view-btn {
  position: absolute;
  top: 90px;
  right: 15%;
}
</style>
