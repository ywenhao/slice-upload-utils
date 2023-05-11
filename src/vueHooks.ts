import type { Ref } from 'vue'
import { readonly, ref, watch } from 'vue'
import type { UploadEventType } from './types/upload/event'
import type { PreVerifyUploadRequest, SliceUploadOptions, SliceUploadStatus, UploadRequest } from '.'
import { defineSliceUpload } from '.'

export interface Chunks {
  status: SliceUploadStatus
  progress: number
  chunkHash: string
  index: number
}

export interface UseSliceUploadOptions extends Omit<SliceUploadOptions, 'file'> {
  onError?: UploadEventType['error']
  onFinish?: UploadEventType['finish']
  preVerifyRequest?: PreVerifyUploadRequest
  file: Ref<File | null | undefined>
  request: UploadRequest
}

export type UploadStatus = 'ready' | 'uploading' | 'pause' | 'finish'

export function useSliceUpload(options: UseSliceUploadOptions) {
  const progress = ref(0)
  const isFinish = ref(false)
  const chunks = ref<Chunks[]>([])
  const status = ref<UploadStatus>('ready')

  const instance = defineSliceUpload({ ...options, file: options.file.value! })
  options.preVerifyRequest && instance.setPreVerifyRequest(options.preVerifyRequest)

  instance.setUploadRequest(options.request)

  watch(options.file, (file) => {
    status.value = 'ready'
    progress.value = 0
    chunks.value = []
    isFinish.value = false
    file && instance.setFile(file)
  })

  watch(status, () => {
    const { chunks: _chunks } = instance.getData()
    chunks.value = _chunks
  })

  instance.on('progress', (params) => {
    progress.value = params.progress
    const { chunks: _chunks } = instance.getData()

    chunks.value = _chunks
  })

  instance.on('finish', (params) => {
    isFinish.value = true
    status.value = 'finish'
    options.onFinish?.(params)
  })

  instance.on('error', (error) => {
    status.value = 'pause'
    options.onError?.(error)
  })

  const setRequest = (request: UploadRequest) => {
    instance.setUploadRequest(request)
  }

  const start = () => {
    if (['finish', 'uploading'].includes(status.value))
      return
    instance.start()
    if (instance.hasFile)
      status.value = 'uploading'
  }

  const pause = () => {
    if (['finish', 'pause', 'ready'].includes(status.value))
      return
    instance.pause()
    status.value = 'pause'
  }

  const cancel = () => {
    instance.cancel()
    status.value = 'ready'
  }

  const ajaxRequest = instance.ajaxRequest

  return {
    chunks,
    instance,
    status: readonly(status),
    progress: readonly(progress),
    isFinish: readonly(isFinish),

    start,
    pause,
    cancel,
    setRequest,
    ajaxRequest,
  }
}
