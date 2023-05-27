/**
 * 上传成功参数
 */
export interface UploadFinishParams {
  file: File
  preHash: string
  filename: string
  chunkSize: number
  chunkTotal: number
}

export interface UploadEventType {
  start: () => void
  finish: (params: UploadFinishParams) => void
  progress: (params: { progress: number }) => void
  error: (error: unknown) => void
  pause: () => void
  cancel: () => void
}

export type UploadEventKey = keyof UploadEventType

export interface DownloadFinishParams {
  file: File
  chunkSize: number
  chunkTotal: number
}

export interface DownloadEventType {
  start: () => void
  finish: (params: DownloadFinishParams) => void
  progress: (params: { progress: number }) => void
  error: (error: unknown) => void
  pause: () => void
  cancel: () => void
}

export type DownloadEventKey = keyof DownloadEventType
