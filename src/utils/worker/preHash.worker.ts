import { getFileHash } from '../hash'

self.onmessage = (e) => {
  const { file } = e.data as { file: File }

  async function run() {
    const hash = await getFileHash(file)
    self.postMessage({ hash })
    self.close()
  }

  run()
}
