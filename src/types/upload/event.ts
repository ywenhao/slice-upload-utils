export interface UploadEventType {
  start: () => void
  finish: () => void
  progress: (payload: { currentChunkProgress: number; progress: number }) => void
  'chunk-uploaded': (payload: { chunk: Blob | File; index: number; chunkHash: string }) => void
  error: (error: unknown) => void
  cancel: () => void
}

export type UploadEventKey = keyof UploadEventType
