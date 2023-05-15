import { getFileHash } from '..'

export async function preHashWorker(params: { file: File }) {
  const { file } = params
  const hash = await getFileHash(file)
  return { hash }
}
