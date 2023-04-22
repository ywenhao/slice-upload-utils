import { ref } from 'vue'
import type { SliceUploadOptions, SliceUploadStatus } from '.'
import { defineSliceUpload } from '.'

export function useSliceUpload(options: SliceUploadOptions) {
  const instance = defineSliceUpload(options)
  const { start, cancel, pause } = instance

  const progress = ref(0)
  const status = ref<SliceUploadStatus>('ready')

  return {
    instance,
    progress,
    status,
    start,
    cancel,
    pause,
  }
}
