import type { RequestHeaders, RequestMethod } from './utils/ajax'

export interface RequestOptions {
  url: string
  /**
   * @default 'POST'
   */
  method?: RequestMethod
  data?: any
  headers?: RequestHeaders
  timeout?: number
  withCredentials?: boolean
  /**
   * Upload chunk binding. Prefer passing this from UploadParams.chunkHash when an
   * upload request awaits anything before calling ajaxRequest.
   */
  chunkHash?: string
  /**
   * Download chunk binding. Prefer passing this from DownloadParams.index when a
   * download request awaits anything before calling ajaxRequest.
   */
  chunkIndex?: number
}
