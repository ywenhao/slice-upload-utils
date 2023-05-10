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

export function useSliceUpload(options: UseSliceUploadOptions) {
  const progress = ref(0)
  const isFinish = ref(false)
  const chunks = ref<Chunks[]>([])
  const status = ref<SliceUploadStatus>('ready')

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
    status.value = instance.status
  })

  instance.on('finish', (params) => {
    status.value = instance.status
    isFinish.value = true
    options.onFinish?.(params)
  })

  instance.on('error', (error) => {
    options.onError?.(error)
  })

  const setRequest = (request: UploadRequest) => {
    instance.setUploadRequest(request)
  }

  const start = () => {
    instance.start()
  }

  const pause = () => {
    instance.pause()
  }

  const cancel = () => {
    instance.cancel()
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
