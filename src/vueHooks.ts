import type { Ref } from 'vue'
import { computed, nextTick, readonly, ref, watch } from 'vue'
import type { DownloadEventType, DownloadRequest, PreVerifyUploadRequest, RequestOptions, SetDownloadFileOptions, SliceDownloadOptions, SliceDownloadStatus, SliceUploadOptions, SliceUploadStatus, UploadEventType, UploadRequest } from '.'
import { defineSliceDownload, defineSliceUpload } from '.'

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

  const instance = defineSliceUpload({ ...options, file: options.file.value! })
  options.preVerifyRequest && instance.setPreVerifyRequest(options.preVerifyRequest)

  instance.setUploadRequest(options.request)

  const setChunk = () => {
    const data = instance.getData()
    chunks.value = data.chunks
  }

  watch(options.file, (file) => {
    status.value = 'ready'
    progress.value = 0
    chunks.value = []
    file && instance.setFile(file)
  })

  watch(status, () => {
    setChunk()
  })

  instance.on('progress', (params) => {
    progress.value = params.progress
    setChunk()
  })

  instance.on('finish', (params) => {
    status.value = 'success'
    setChunk()
    options.onFinish?.(params)
  })

  instance.on('error', (error) => {
    if (['uploading'].includes(status.value))
      status.value = 'error'
    setChunk()
    if (status.value === 'error')
      options.onError?.(error)
  })

  const setRequest = (request: UploadRequest) => {
    instance.setUploadRequest(request)
  }

  const start = async () => {
    await nextTick()
    if (['success', 'uploading'].includes(status.value))
      return
    instance.start()
    if (instance.hasFile)
      status.value = 'uploading'
    setChunk()
  }

  const pause = () => {
    if (['success', 'cancel', 'pause', 'ready'].includes(status.value))
      return
    instance.pause()
    status.value = 'pause'
    setChunk()
  }

  const cancel = () => {
    if (['cancel', 'ready'].includes(status.value))
      return
    instance.cancel()
    status.value = 'cancel'
    setChunk()
  }

  const ajaxRequest = (params: RequestOptions) => instance.ajaxRequest(params)

  // onBeforeUnmount(() => {
  //   instance.destroy()
  // })

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

  const instance = defineSliceDownload({ ...options })

  instance.setDownloadRequest(options.request)

  const setChunk = () => {
    const data = instance.getData()
    chunks.value = data.chunks
  }

  watch(status, () => {
    setChunk()
  })

  instance.on('progress', (params) => {
    progress.value = params.progress
    setChunk()
  })

  instance.on('finish', (params) => {
    status.value = 'success'
    setChunk()
    options.onFinish?.(params)
  })

  instance.on('error', (error) => {
    if (['downloading'].includes(status.value))
      status.value = 'error'
    setChunk()
    if (status.value === 'error')
      options.onError?.(error)
  })

  const setRequest = (request: DownloadRequest) => {
    instance.setDownloadRequest(request)
  }
  const ajaxRequest = (params: RequestOptions) => instance.ajaxRequest(params)
  const setFileOptions = (options: SetDownloadFileOptions) => instance.setFileOptions(options)

  const start = () => {
    if (['success', 'downloading'].includes(status.value))
      return
    instance.start()
    status.value = 'downloading'
    setChunk()
  }

  const pause = () => {
    if (['success', 'cancel', 'pause', 'ready'].includes(status.value))
      return
    instance.pause()
    status.value = 'pause'
    setChunk()
  }

  const cancel = () => {
    if (['cancel', 'ready'].includes(status.value))
      return
    instance.cancel()
    status.value = 'cancel'
    setChunk()
  }

  // onBeforeUnmount(() => {
  //   instance.destroy()
  // })

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
