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

/**
 * 上传进度参数
 */
export interface UploadProgressParams {
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
