import type { Ref } from 'vue'
import { ref, watch } from 'vue'
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
    file && instance.setFile(file)
  })

  instance.on('progress', (params) => {
    progress.value = params.progress
    const { chunks: _chunks } = instance.getData()
    chunks.value = _chunks
    status.value = 'uploading'
  })

  instance.on('finish', (params) => {
    status.value = 'finish'
    isFinish.value = true
    options.onFinish?.(params)
  })

  instance.on('error', (error) => {
    options.onError?.(error)
    status.value = 'pause'
  })

  const setRequest = (request: UploadRequest) => {
    instance.setUploadRequest(request)
  }

  const start = () => {
    instance.start()
  }

  const pause = () => {
    instance.pause()
    status.value = 'pause'
  }

  const cancel = () => {
    instance.cancel()
    status.value = 'ready'
  }

  const ajaxRequest = instance.ajaxRequest

  return {
    instance,
    isFinish,
    progress,
    status,
    start,
    pause,
    cancel,
    setRequest,
    ajaxRequest,
  }
}
