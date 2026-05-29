export interface RequestProgressEvent extends ProgressEvent {
  percent: number
}

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'PATCH'

export type RequestHeaders = Headers | Record<string, string | number | null | undefined>

export interface AjaxRequestOptions {
  url: string
  method: RequestMethod
  timeout?: number
  data?: XMLHttpRequestBodyInit | FormData
  responseType?: XMLHttpRequestResponseType
  headers?: RequestHeaders
  readystatechange?: () => void
  onLoadstart?: () => void
  onLoad?: () => void
  onAbort?: (evt: AjaxRequestError) => void
  onError: (evt: AjaxRequestError) => void
  onUploadProgress?: (evt: RequestProgressEvent) => void
  onDownloadProgress?: (evt: RequestProgressEvent) => void
  onSuccess: (response: any) => void
  withCredentials: boolean
}

export type RequestStatus =
  | 'ready'
  | 'downloading'
  | 'uploading'
  | 'success'
  | 'error'
  | 'pause'
  | 'cancel'

export interface CustomXHR extends XMLHttpRequest {
  request: () => void
}

export type AjaxRequestHandler = (options: AjaxRequestOptions) => CustomXHR

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

function getError(url: string, option: AjaxRequestOptions, xhr: XMLHttpRequest) {
  let msg: string
  if (xhr.responseType === 'blob') msg = 'fail to responseType blob'
  else if (xhr.response) msg = `${xhr.response.error || xhr.response}`
  else if (xhr.responseText) msg = `${xhr.responseText}`
  else msg = `fail to ${option.method} ${url} ${xhr.status}`

  return new AjaxRequestError(msg, xhr.status, option.method, url)
}

function getBody(xhr: XMLHttpRequest): XMLHttpRequestResponseType {
  if (xhr.responseType === 'blob') return xhr.response || xhr.responseText

  const text = xhr.responseText || xhr.response
  if (!text) return text

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function isObject(data: unknown): data is Record<string, unknown> {
  return !(data instanceof FormData) && data !== null && typeof data === 'object'
}

function hasJson(values: unknown[]) {
  return values.some((value) => String(value).includes('application/json'))
}

function getHeaderValues(headers: RequestHeaders) {
  if (headers instanceof Headers) {
    const values: string[] = []
    headers.forEach((value) => values.push(value))
    return values
  }

  return Object.values(headers)
}

export const ajaxRequest: AjaxRequestHandler = (option) => {
  if (typeof XMLHttpRequest === 'undefined') throw new Error('XMLHttpRequest is undefined')

  const xhr = new XMLHttpRequest() as CustomXHR
  const url = option.url

  if (option.timeout !== undefined) {
    xhr.timeout = option.timeout
    xhr.ontimeout = () => {
      option.onError(getError(url, option, xhr))
    }
  }

  if (option.responseType) xhr.responseType = option.responseType

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

  xhr.addEventListener('loadstart', () => {
    option.onLoadstart?.()
  })

  if (option.onAbort) {
    xhr.addEventListener('abort', () => {
      option.onAbort?.(getError(url, option, xhr))
    })
  }

  xhr.addEventListener('error', () => {
    option.onError(getError(url, option, xhr))
  })

  xhr.addEventListener('readystatechange', () => {
    option.readystatechange?.()
  })

  xhr.addEventListener('load', () => {
    option.onLoad?.()
  })

  xhr.addEventListener('load', () => {
    if (xhr.status < 200 || xhr.status >= 300) return option.onError(getError(url, option, xhr))

    option.onSuccess(getBody(xhr))
  })

  if (option.withCredentials && 'withCredentials' in xhr) xhr.withCredentials = true

  const setHeader = () => {
    const headers = option.headers || {}
    if (headers instanceof Headers) {
      headers.forEach((value, key) => xhr.setRequestHeader(key, value))
    } else if (headers && typeof headers === 'object') {
      for (const [key, value] of Object.entries(headers)) {
        if (value === null || value === undefined) continue
        xhr.setRequestHeader(key, String(value))
      }
    }

    if (
      option.method !== 'GET' &&
      isObject(option.data) &&
      (!headers ||
        (headers instanceof Headers && !hasJson(getHeaderValues(headers))) ||
        (headers && typeof headers === 'object' && !hasJson(getHeaderValues(headers))))
    )
      xhr.setRequestHeader('Content-Type', 'application/json;charset=utf-8')
  }

  xhr.request = () => {
    let requestUrl = option.url
    const isGet = option.method === 'GET'
    let data = option.data
    if (isGet && data) {
      const prefix = requestUrl.includes('?') ? '&' : '?'
      if (typeof data === 'string') {
        requestUrl += prefix + data
      } else {
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(data)) {
          if (value === null || value === undefined) continue
          params.append(key, String(value))
        }
        requestUrl += prefix + params.toString()
      }
    } else if (!isGet && isObject(data)) {
      data = JSON.stringify(data)
    }
    xhr.open(option.method, requestUrl, true)
    setHeader()
    xhr.send(isGet ? null : data)
  }

  return xhr
}
