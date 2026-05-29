import { useCallback, useEffect, useRef, useState } from 'react'
import type { RequestOptions } from './request'
import type { DownloadEventType, UploadEventType } from './types'
import type { SliceDownloadStatus, SliceUploadOptions, SliceUploadStatus } from './types'
import type { DownloadRequest, SetDownloadFileOptions, SliceDownloadOptions } from './download'
import type { PreVerifyUploadRequest, UploadRequest } from './upload'
import { defineSliceDownload, type SliceDownload } from './download'
import { defineSliceUpload, type SliceUpload } from './upload'
import type { SliceDownloadChunk, SliceUploadChunk } from './vueHooks'

export interface UseReactSliceUploadOptions extends Omit<SliceUploadOptions, 'file'> {
  file?: File | null
  request: UploadRequest
  onError?: UploadEventType['error']
  onFinish?: UploadEventType['finish']
  preVerifyRequest?: PreVerifyUploadRequest
}

export interface UseReactSliceUploadReturn {
  chunks: SliceUploadChunk[]
  instance: SliceUpload
  isFinish: boolean
  status: SliceUploadStatus
  progress: number
  start: () => Promise<void>
  pause: () => void
  cancel: () => void
  setRequest: (request: UploadRequest) => void
  ajaxRequest: <D = any>(params: RequestOptions) => Promise<D>
}

export function useSliceUpload(options: UseReactSliceUploadOptions): UseReactSliceUploadReturn {
  const { file, request, preVerifyRequest, onError, onFinish, ...sliceOptions } = options
  const callbacksRef = useRef({ onError, onFinish })
  callbacksRef.current = { onError, onFinish }

  const [instance] = useState(() => {
    const upload = defineSliceUpload({ ...sliceOptions, file: file || undefined })
    upload.setUploadRequest(request)
    if (preVerifyRequest) upload.setPreVerifyRequest(preVerifyRequest)
    return upload
  })

  const [chunks, setChunks] = useState<SliceUploadChunk[]>(() => instance.getData().chunks)
  const [progress, setProgress] = useState(instance.progress)
  const [status, setStatus] = useState<SliceUploadStatus>(instance.status)
  const isFinish = progress === 100

  const syncState = useCallback(() => {
    setStatus(instance.status)
    setProgress(instance.progress)
    setChunks(instance.getData().chunks)
  }, [instance])

  useEffect(() => {
    instance.setUploadRequest(request)
  }, [instance, request])

  useEffect(() => {
    if (preVerifyRequest) instance.setPreVerifyRequest(preVerifyRequest)
  }, [instance, preVerifyRequest])

  useEffect(() => {
    if (file) instance.setFile(file)
    else instance.reset()
    syncState()
  }, [file, instance, syncState])

  useEffect(() => {
    const onProgress = () => syncState()
    const handleFinish: UploadEventType['finish'] = (params) => {
      syncState()
      callbacksRef.current.onFinish?.(params)
    }
    const onUploadError: UploadEventType['error'] = (error) => {
      syncState()
      if (instance.status === 'error') callbacksRef.current.onError?.(error)
    }

    instance.on('progress', onProgress)
    instance.on('finish', handleFinish)
    instance.on('error', onUploadError)

    return () => {
      instance.off('progress', onProgress)
      instance.off('finish', handleFinish)
      instance.off('error', onUploadError)
    }
  }, [instance, syncState])

  useEffect(() => () => instance.destroy(), [instance])

  const start = useCallback(async () => {
    if (['success', 'uploading'].includes(instance.status)) return
    const task = instance.start()
    syncState()
    await task
    syncState()
  }, [instance, syncState])

  const pause = useCallback(() => {
    if (['success', 'cancel', 'pause', 'ready'].includes(instance.status)) return
    instance.pause()
    syncState()
  }, [instance, syncState])

  const cancel = useCallback(() => {
    if (['cancel', 'ready'].includes(instance.status)) return
    instance.cancel()
    syncState()
  }, [instance, syncState])

  const setRequest = useCallback(
    (nextRequest: UploadRequest) => {
      instance.setUploadRequest(nextRequest)
    },
    [instance],
  )

  const ajaxRequest = useCallback(
    <D = any>(params: RequestOptions) => instance.ajaxRequest<D>(params),
    [instance],
  )

  return {
    chunks,
    instance,
    isFinish,
    status,
    progress,
    start,
    pause,
    cancel,
    setRequest,
    ajaxRequest,
  }
}

export interface UseReactSliceDownloadOptions extends SliceDownloadOptions {
  request: DownloadRequest
  onError?: DownloadEventType['error']
  onFinish?: DownloadEventType['finish']
}

export interface UseReactSliceDownloadReturn {
  chunks: SliceDownloadChunk[]
  instance: SliceDownload
  isFinish: boolean
  status: SliceDownloadStatus
  progress: number
  start: () => Promise<void>
  pause: () => void
  cancel: () => void
  setRequest: (request: DownloadRequest) => void
  ajaxRequest: <D = any>(params: RequestOptions) => Promise<D>
  setFileOptions: (options: SetDownloadFileOptions) => void
}

export function useSliceDownload(
  options: UseReactSliceDownloadOptions,
): UseReactSliceDownloadReturn {
  const { request, onError, onFinish, ...sliceOptions } = options
  const callbacksRef = useRef({ onError, onFinish })
  callbacksRef.current = { onError, onFinish }

  const [instance] = useState(() => {
    const download = defineSliceDownload(sliceOptions)
    download.setDownloadRequest(request)
    return download
  })

  const [chunks, setChunks] = useState<SliceDownloadChunk[]>(() => instance.getData().chunks)
  const [progress, setProgress] = useState(instance.progress)
  const [status, setStatus] = useState<SliceDownloadStatus>(instance.status)
  const isFinish = progress === 100

  const syncState = useCallback(() => {
    setStatus(instance.status)
    setProgress(instance.progress)
    setChunks(instance.getData().chunks)
  }, [instance])

  useEffect(() => {
    instance.setDownloadRequest(request)
  }, [instance, request])

  useEffect(() => {
    const onProgress = () => syncState()
    const handleFinish: DownloadEventType['finish'] = (params) => {
      syncState()
      callbacksRef.current.onFinish?.(params)
    }
    const onDownloadError: DownloadEventType['error'] = (error) => {
      syncState()
      if (instance.status === 'error') callbacksRef.current.onError?.(error)
    }

    instance.on('progress', onProgress)
    instance.on('finish', handleFinish)
    instance.on('error', onDownloadError)

    return () => {
      instance.off('progress', onProgress)
      instance.off('finish', handleFinish)
      instance.off('error', onDownloadError)
    }
  }, [instance, syncState])

  useEffect(() => () => instance.destroy(), [instance])

  const start = useCallback(async () => {
    if (['success', 'downloading'].includes(instance.status)) return
    const task = instance.start()
    syncState()
    await task
    syncState()
  }, [instance, syncState])

  const pause = useCallback(() => {
    if (['success', 'cancel', 'pause', 'ready'].includes(instance.status)) return
    instance.pause()
    syncState()
  }, [instance, syncState])

  const cancel = useCallback(() => {
    if (['cancel', 'ready'].includes(instance.status)) return
    instance.cancel()
    syncState()
  }, [instance, syncState])

  const setRequest = useCallback(
    (nextRequest: DownloadRequest) => {
      instance.setDownloadRequest(nextRequest)
    },
    [instance],
  )

  const ajaxRequest = useCallback(
    <D = any>(params: RequestOptions) => instance.ajaxRequest<D>(params),
    [instance],
  )

  const setFileOptions = useCallback(
    (nextOptions: SetDownloadFileOptions) => {
      instance.setFileOptions(nextOptions)
      syncState()
    },
    [instance, syncState],
  )

  return {
    chunks,
    instance,
    isFinish,
    status,
    progress,
    start,
    pause,
    cancel,
    setRequest,
    ajaxRequest,
    setFileOptions,
  }
}
