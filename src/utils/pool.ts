type PromiseFn = () => Promise<any>
type PromiseResult<T extends PromiseFn> = Awaited<ReturnType<T>>

interface PoolParams<T extends PromiseFn> {
  promiseList: T[]
  limit: number
  beStop?: () => boolean
  resolve?: (res: PromiseResult<T>) => void
  reject?: (res: unknown) => void
}

/**
 * 并发控制
 * @param promiseList Promise列表
 * @param limit 并发数
 * @param resolve 单个Promise resolve
 * @param reject 单个Promise reject
 */
export async function promisePool<T extends PromiseFn>(params: PoolParams<T>) {
  const { promiseList, limit, resolve, reject } = params
  const poolSet = new Set<Promise<void>>()
  const safeLimit = Math.max(1, Math.floor(limit))

  for (const promiseFn of promiseList) {
    if (params.beStop?.()) break

    while (poolSet.size >= safeLimit) await Promise.race(poolSet)

    if (params.beStop?.()) break

    const onfulfilled = (res: PromiseResult<T>) => {
      resolve?.(res)
    }

    const onrejected = (res: unknown) => {
      reject?.(res)
      if (!reject) throw res
    }

    let promise!: Promise<void>
    promise = Promise.resolve()
      .then(promiseFn)
      .then(onfulfilled, onrejected)
      .finally(() => {
        poolSet.delete(promise)
      })
    poolSet.add(promise)
  }

  await Promise.all(poolSet)
}
