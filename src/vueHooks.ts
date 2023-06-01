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

export type UploadStatus = 'ready' | 'uploading' | 'pause' | 'finish'

export function useSliceUpload(options: UseSliceUploadOptions) {
  const progress = ref(0)
  const chunks = ref<SliceUploadChunk[]>([])
  const status = ref<UploadStatus>('ready')
  const isFinish = computed(() => progress.value === 100)

  const instance = defineSliceUpload({ ...options, file: options.file.value! })
  options.preVerifyRequest && instance.setPreVerifyRequest(options.preVerifyRequest)

  instance.setUploadRequest(options.request)

  watch(options.file, (file) => {
    status.value = 'ready'
    progress.value = 0
    chunks.value = []
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

  const start = async () => {
    if (['finish', 'uploading'].includes(status.value))
      return
    await nextTick()
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

  const ajaxRequest = (params: RequestOptions) => instance.ajaxRequest(params)

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

export type DownloadStatus = 'ready' | 'downloading' | 'pause' | 'finish'

export function useSliceDownload(options: UseSliceDownloadOptions) {
  const progress = ref(0)
  const chunks = ref<SliceDownloadChunk[]>([])
  const status = ref<DownloadStatus>('ready')
  const isFinish = computed(() => progress.value === 100)

  const instance = defineSliceDownload({ ...options })

  instance.setDownloadRequest(options.request)

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
    status.value = 'finish'
    options.onFinish?.(params)
  })

  instance.on('error', (error) => {
    status.value = 'pause'
    options.onError?.(error)
  })

  const setRequest = (request: DownloadRequest) => {
    instance.setDownloadRequest(request)
  }
  const ajaxRequest = (params: RequestOptions) => instance.ajaxRequest(params)
  const setFileOptions = (options: SetDownloadFileOptions) => instance.setFileOptions(options)

  const start = () => {
    if (['finish', 'downloading'].includes(status.value))
      return
    instance.start()
    status.value = 'downloading'
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
