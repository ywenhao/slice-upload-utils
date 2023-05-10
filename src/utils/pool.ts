type PromiseFn = (...args: any) => Promise<any>

interface PoolParams<T extends PromiseFn> {
  promiseList: T[]
  limit: number
  resolve: (res: ReturnType<T>) => void
  reject: (res: ReturnType<T> | Error) => void
}

/**
 * 并发控制
 * @param promiseList Promise列表
 * @param limit 并发数
 * @param resolve 单个Promise resolve
 * @param reject 单个Promise reject
 */
export async function promisePool<T extends PromiseFn>(
  { promiseList, limit, resolve, reject }: PoolParams<T>,
) {
  const poolSet = new Set()

  for (const promiseFn of promiseList) {
    if (poolSet.size >= limit)
      await Promise.race(poolSet).catch(e => e)

    const onfulfilled = (res: Parameters<typeof resolve>[0]) => {
      resolve(res)
    }

    const onrejected = (res: Parameters<typeof reject>[0]) => {
      reject(res)
    }

    const promise = promiseFn()
    poolSet.add(promise)

    promise.then(onfulfilled, onrejected).finally(() => {
      poolSet.delete(promise)
    })
  }
}
