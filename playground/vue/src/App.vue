<script setup lang="ts">
import { computed, ref } from 'vue'
import Upload from './example/Upload.vue'
import Download from './example/Download.vue'

const active = ref(0)
const title = computed(() => (active.value === 1 ? 'Download' : 'Upload'))
const btnText = computed(() => (active.value === 0 ? 'Download' : 'Upload'))
</script>

<template>
  <div class="app-box">
    <button class="view-btn" @click="active = active === 1 ? 0 : 1">
      View {{ btnText }} Example
    </button>
    <h2 class="title">{{ title }} Example</h2>
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
