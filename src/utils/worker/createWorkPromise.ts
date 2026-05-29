/**
 * 创建worker promise
 * @param workURL url地址
 * @returns
 */
export async function createWorkPromise<Params, Result>(
  workURL: URL,
  params: Params,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workURL, {
      type: 'module',
    })
    const cleanup = () => worker.terminate()
    worker.onmessage = (event) => {
      cleanup()
      resolve(event.data)
    }
    worker.onerror = (event) => {
      cleanup()
      reject(event)
    }
    worker.postMessage(params)
  })
}

// TODO: cancel worker
