export interface UploadEventType {
  start: () => void
  finish: () => void
  progress: (payload: { currentChunkProgress: number; progress: number; index: string; chunkHash: string }) => void
  'chunk-uploaded': (payload: { chunk: Blob | File; index: number; chunkHash: string }) => void
  error: (error: unknown) => void
  cancel: () => void
}

export type UploadEventKey = keyof UploadEventType
