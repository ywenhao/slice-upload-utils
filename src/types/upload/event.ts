export interface UploadEventType {
  start: () => void
  finish: (payload: { preHash: string; filename: string; file: File; chunkSize: number; chunkTotal: number }) => void
  progress: (payload: { progress: number }) => void
  error: (error: unknown) => void
  pause: () => void
  cancel: () => void
}

export type UploadEventKey = keyof UploadEventType
