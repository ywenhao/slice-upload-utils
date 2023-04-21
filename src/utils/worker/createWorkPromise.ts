/**
 * 创建worker promise
 * @param workURL url地址
 * @returns
 */
export async function createWorkPromise<Params, Result>(workURL: URL, params: Params): Promise<Result> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workURL, {
      type: 'module',
    })
    worker.onmessage = (event) => {
      resolve(event.data)
    }
    worker.onerror = (event) => {
      reject(event)
    }
    worker.postMessage(params)
  })
}
