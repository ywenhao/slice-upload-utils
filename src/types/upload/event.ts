export interface UploadEventType {
  start: () => void
  finish: (payload: { preHash: string; filename: string; file: File; chunkSize: number; chunkTotal: number }) => void
  progress: (payload: { currentChunkProgress: number; progress: number; index: number; chunkHash: string }) => void
  error: (error: unknown) => void
  pause: () => void
  cancel: () => void
}

export type UploadEventKey = keyof UploadEventType
