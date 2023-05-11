type PromiseFn = (...args: any) => Promise<any>
type GetFirstParams<T> = T extends (...args: any[]) => any ? Parameters<T>[0] : never

interface PoolParams<T extends PromiseFn> {
  promiseList: T[]
  limit: number
  beStop?: () => boolean
  resolve?: (res: ReturnType<T>) => void
  reject?: (res: ReturnType<T> | Error) => void
}

/**
 * 并发控制
 * @param promiseList Promise列表
 * @param limit 并发数
 * @param resolve 单个Promise resolve
 * @param reject 单个Promise reject
 */
export async function promisePool<T extends PromiseFn>(
  params: PoolParams<T>,
) {
  const { promiseList, limit, resolve, reject } = params
  const poolSet = new Set()

  for (const promiseFn of promiseList) {
    if (params.beStop?.())
      return

    if (poolSet.size >= limit)
      await Promise.race(poolSet).catch(e => e)

    const onfulfilled = (res: GetFirstParams<typeof resolve>) => {
      resolve?.(res)
    }

    const onrejected = (res: GetFirstParams<typeof reject>) => {
      reject?.(res)
    }

    const promise = promiseFn()
    poolSet.add(promise)

    promise.then(onfulfilled, onrejected).finally(() => {
      poolSet.delete(promise)
    })
  }
}
