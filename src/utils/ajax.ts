// import type { Awaitable } from 'vitest'

export interface RequestProgressEvent extends ProgressEvent {
  percent: number
}

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'PATCH'

export type RequestHeads = Headers | Record<string, string | number | null | undefined>

export interface AjaxRequestOptions {
  url: string
  method: RequestMethod
  timeout?: number
  data: XMLHttpRequestBodyInit | FormData
  // filename: string
  // file: File
  headers?: RequestHeads
  onError: (evt: AjaxRequestError) => void
  onUploadProgress?: (evt: RequestProgressEvent) => void
  onDownloadProgress?: (evt: RequestProgressEvent) => void
  onSuccess: (response: any) => void
  withCredentials: boolean
}

export type RequestStatus = 'ready' | 'downloading' | 'uploading' | 'success' | 'fail'

export interface RequestFile {
  name: string
  percentage?: number
  status: RequestStatus
  size?: number
  response?: unknown
  uid: number
  url?: string
  raw?: RequestRawFile
}

export interface RequestRawFile extends File {
  uid: number
}

export type AjaxRequestHandler = (
  options: AjaxRequestOptions
) => XMLHttpRequest | Promise<unknown>

export type RequestFiles = RequestFile[]

// export interface UploadHooks {
//   beforeUpload: (
//     rawFile: UploadRawFile
//   ) => Awaitable<void | undefined | null | boolean | File | Blob>
//   beforeRemove: (
//     uploadFile: RequestFile,
//     uploadFiles: RequestFiles
//   ) => Awaitable<boolean>
//   onRemove: (uploadFile: RequestFile, uploadFiles: RequestFiles) => void
//   onChange: (uploadFile: RequestFile, uploadFiles: RequestFiles) => void
//   onPreview: (uploadFile: RequestFile) => void
//   onSuccess: (
//     response: any,
//     uploadFile: RequestFile,
//     uploadFiles: RequestFiles
//   ) => void
//   onProgress: (
//     evt: UploadProgressEvent,
//     uploadFile: RequestFile,
//     uploadFiles: RequestFiles
//   ) => void
//   onError: (
//     error: Error,
//     uploadFile: RequestFile,
//     uploadFiles: RequestFiles
//   ) => void
//   // onExceed: (files: File[], uploadFiles: UploadUserFile[]) => void
// }

export class AjaxRequestError extends Error {
  name = 'AjaxRequestError'
  status: number
  method: string
  url: string

  constructor(message: string, status: number, method: string, url: string) {
    super(message)
    this.status = status
    this.method = method
    this.url = url
  }
}

function getError(
  url: string,
  option: AjaxRequestOptions,
  xhr: XMLHttpRequest,
) {
  let msg: string
  if (xhr.response)
    msg = `${xhr.response.error || xhr.response}`

  else if (xhr.responseText)
    msg = `${xhr.responseText}`

  else
    msg = `fail to ${option.method} ${url} ${xhr.status}`

  return new AjaxRequestError(msg, xhr.status, option.method, url)
}

function getBody(xhr: XMLHttpRequest): XMLHttpRequestResponseType {
  const text = xhr.responseText || xhr.response
  if (!text)
    return text

  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}

export const ajaxRequest: AjaxRequestHandler = (option) => {
  if (typeof XMLHttpRequest === 'undefined')
    throw new Error('XMLHttpRequest is undefined')

  const xhr = new XMLHttpRequest()
  const url = option.url

  if (option.timeout !== undefined) {
    xhr.timeout = option.timeout
    xhr.ontimeout = () => {
      option.onError(getError(url, option, xhr))
    }
  }

  if (xhr.upload && option.onUploadProgress) {
    xhr.upload.addEventListener('progress', (evt) => {
      const progressEvt = evt as RequestProgressEvent
      progressEvt.percent = evt.total > 0 ? (evt.loaded / evt.total) * 100 : 0
      option.onUploadProgress?.(progressEvt)
    })
  }

  if (option.onDownloadProgress) {
    xhr.addEventListener('progress', (evt) => {
      const progressEvt = evt as RequestProgressEvent
      progressEvt.percent = evt.total > 0 ? (evt.loaded / evt.total) * 100 : 0
      option.onDownloadProgress?.(progressEvt)
    })
  }

  xhr.addEventListener('error', () => {
    option.onError(getError(url, option, xhr))
  })

  xhr.addEventListener('load', () => {
    if (xhr.status < 200 || xhr.status >= 300)
      return option.onError(getError(url, option, xhr))

    option.onSuccess(getBody(xhr))
  })

  xhr.open(option.method, url, true)

  if (option.withCredentials && 'withCredentials' in xhr)
    xhr.withCredentials = true

  const headers = option.headers || {}
  if (headers instanceof Headers) {
    headers.forEach((value, key) => xhr.setRequestHeader(key, value))
  }
  else {
    for (const [key, value] of Object.entries(headers)) {
      if (value === null || value === undefined)
        continue
      xhr.setRequestHeader(key, String(value))
    }
  }

  xhr.send(option.data)
  return xhr
}
