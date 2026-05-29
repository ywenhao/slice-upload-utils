import type { Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, readonly, ref, watch } from 'vue'
import type { RequestOptions } from './request'
import type { DownloadEventType, UploadEventType } from './types'
import type { SliceDownloadStatus, SliceUploadOptions, SliceUploadStatus } from './types'
import type { DownloadRequest, SetDownloadFileOptions, SliceDownloadOptions } from './download'
import type { PreVerifyUploadRequest, UploadRequest } from './upload'
import { defineSliceDownload } from './download'
import { defineSliceUpload } from './upload'

export interface SliceUploadChunk {
  status: SliceUploadStatus
  progress: number
  chunkHash: string
  index: number
}

export interface UseSliceUploadOptions extends Omit<SliceUploadOptions, 'file'> {
  file: Ref<File | null | undefined>
  request: UploadRequest
  onError?: UploadEventType['error']
  onFinish?: UploadEventType['finish']
  preVerifyRequest?: PreVerifyUploadRequest
}

export function useSliceUpload(options: UseSliceUploadOptions) {
  const progress = ref(0)
  const chunks = ref<SliceUploadChunk[]>([])
  const status = ref<SliceUploadStatus>('ready')
  const isFinish = computed(() => progress.value === 100)
  const { file, request, onError, onFinish, preVerifyRequest, ...sliceOptions } = options
  const instance = defineSliceUpload({ ...sliceOptions, file: file.value || undefined })

  const setChunk = () => {
    const data = instance.getData()
    chunks.value = data.chunks
  }

  const syncStatus = () => {
    status.value = instance.status
    progress.value = instance.progress
    setChunk()
  }

  if (preVerifyRequest) instance.setPreVerifyRequest(preVerifyRequest)

  instance.setUploadRequest(request)

  watch(file, (nextFile) => {
    progress.value = 0
    chunks.value = []
    if (nextFile) instance.setFile(nextFile)
    else instance.reset()
    syncStatus()
  })

  watch(status, () => {
    setChunk()
  })

  instance.on('progress', (params) => {
    progress.value = params.progress
    status.value = instance.status
    setChunk()
  })

  instance.on('finish', (params) => {
    syncStatus()
    onFinish?.(params)
  })

  instance.on('error', (error) => {
    syncStatus()
    if (status.value === 'error') onError?.(error)
  })

  const setRequest = (nextRequest: UploadRequest) => {
    instance.setUploadRequest(nextRequest)
  }

  const start = async () => {
    await nextTick()
    if (['success', 'uploading'].includes(status.value)) return
    const task = instance.start()
    syncStatus()
    await task
    syncStatus()
  }

  const pause = () => {
    if (['success', 'cancel', 'pause', 'ready'].includes(status.value)) return
    instance.pause()
    syncStatus()
  }

  const cancel = () => {
    if (['cancel', 'ready'].includes(status.value)) return
    instance.cancel()
    syncStatus()
  }

  const ajaxRequest = (params: RequestOptions) => instance.ajaxRequest(params)

  onBeforeUnmount(() => {
    instance.destroy()
  })

  return {
    chunks,
    instance,
    isFinish,
    status: readonly(status),
    progress: readonly(progress),

    start,
    pause,
    cancel,
    setRequest,
    ajaxRequest,
  }
}

export interface SliceDownloadChunk {
  status: SliceDownloadStatus
  progress: number
  start: number
  end: number
  index: number
}

export interface UseSliceDownloadOptions extends SliceDownloadOptions {
  request: DownloadRequest
  onError?: DownloadEventType['error']
  onFinish?: DownloadEventType['finish']
}

export function useSliceDownload(options: UseSliceDownloadOptions) {
  const progress = ref(0)
  const chunks = ref<SliceDownloadChunk[]>([])
  const status = ref<SliceDownloadStatus>('ready')
  const isFinish = computed(() => progress.value === 100)
  const { request, onError, onFinish, ...sliceOptions } = options
  const instance = defineSliceDownload(sliceOptions)

  const setChunk = () => {
    const data = instance.getData()
    chunks.value = data.chunks
  }

  const syncStatus = () => {
    status.value = instance.status
    progress.value = instance.progress
    setChunk()
  }

  instance.setDownloadRequest(request)

  watch(status, () => {
    setChunk()
  })

  instance.on('progress', (params) => {
    progress.value = params.progress
    status.value = instance.status
    setChunk()
  })

  instance.on('finish', (params) => {
    syncStatus()
    onFinish?.(params)
  })

  instance.on('error', (error) => {
    syncStatus()
    if (status.value === 'error') onError?.(error)
  })

  const setRequest = (nextRequest: DownloadRequest) => {
    instance.setDownloadRequest(nextRequest)
  }
  const ajaxRequest = (params: RequestOptions) => instance.ajaxRequest(params)
  const setFileOptions = (nextOptions: SetDownloadFileOptions) => {
    instance.setFileOptions(nextOptions)
    syncStatus()
  }

  const start = async () => {
    if (['success', 'downloading'].includes(status.value)) return
    const task = instance.start()
    syncStatus()
    await task
    syncStatus()
  }

  const pause = () => {
    if (['success', 'cancel', 'pause', 'ready'].includes(status.value)) return
    instance.pause()
    syncStatus()
  }

  const cancel = () => {
    if (['cancel', 'ready'].includes(status.value)) return
    instance.cancel()
    syncStatus()
  }

  onBeforeUnmount(() => {
    instance.destroy()
  })

  return {
    chunks,
    instance,
    isFinish,
    status: readonly(status),
    progress: readonly(progress),

    start,
    pause,
    cancel,
    setRequest,
    ajaxRequest,
    setFileOptions,
  }
}
