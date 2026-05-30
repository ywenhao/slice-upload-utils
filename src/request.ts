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
   * Upload chunk binding kept for backward compatibility. Prefer chunkIndex when
   * a request awaits anything before calling ajaxRequest.
   */
  chunkHash?: string
  /**
   * Upload/download chunk binding. params.ajaxRequest sets this automatically.
   */
  chunkIndex?: number
}
