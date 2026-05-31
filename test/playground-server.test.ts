import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { createPlaygroundServer } from '../playground/server/src/server'
import { defineSliceDownload, defineSliceUpload, getHashChunks } from '../src'
import { createDeferred, createFile } from './helpers'

describe('playground upload/download server', () => {
  const fixturePath = join(process.cwd(), 'playground', 'fixtures', 'mp4.zip')
  const emptyFixturesDir = join(process.cwd(), 'temp', 'empty-fixtures')
  let baseUrl = ''
  let server: ReturnType<typeof createPlaygroundServer>
  let storageDir = ''

  beforeEach(async () => {
    const tempRoot = join(process.cwd(), 'temp')
    await mkdir(emptyFixturesDir, { recursive: true })
    storageDir = await mkdtemp(join(tempRoot, 'slice-upload-utils-'))
    await startServer({ fixturesDir: emptyFixturesDir })
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await rm(storageDir, { force: true, recursive: true })
  })

  it('accepts chunk upload, pre-verifies uploaded chunks, merges, and supports range download', async () => {
    const source = createFile('hello slice server', 'hello.txt')
    const upload = defineSliceUpload({ chunkSize: 5, file: source, poolCount: 2 })
    const merged = createDeferred<number>()
    let mergedFileSize = 0

    upload.setPreVerifyRequest(async (params) => {
      const result = await postJson<{ data: string[] | true }>('/api/upload/verify', params)
      return result.data
    })
    upload.setUploadRequest(async (params) => {
      const response = await postMultipart('/api/upload/chunk', {
        chunk: params.chunk,
        chunkHash: params.chunkHash,
        chunkSize: 5,
        chunkTotal: params.chunkTotal,
        filename: params.filename,
        index: params.index,
        preHash: params.preHash,
      })
      if (!response.ok) throw new Error(await response.text())
      const result = await response.json<{ code: number }>()
      return result.code === 200
    })
    upload.on('finish', async (params) => {
      const result = await postJson<{ data: { fileSize: number } }>('/api/upload/merge', params)
      mergedFileSize = result.data.fileSize
      merged.resolve(mergedFileSize)
    })

    await upload.start()
    await merged.promise

    expect(upload.status).toBe('success')
    expect(mergedFileSize).toBe(source.size)
    await expect(readFile(join(storageDir, 'files', 'hello.txt'), 'utf8')).resolves.toBe(
      await source.text(),
    )

    const hashResult = await getHashChunks({
      chunkSize: 5,
      file: source,
      realChunkHash: false,
      realPreHash: false,
    })
    const verify = await postJson<{ data: string[] | true }>('/api/upload/verify', {
      chunkTotal: hashResult.fileChunks.length,
      preHash: hashResult.preHash,
    })
    expect(verify.data).toBe(true)

    const meta = await getJson<{ data: { fileSize: number; fileType: string } }>(
      '/api/files/hello.txt/meta',
    )
    expect(meta.data.fileSize).toBe(source.size)
    expect(meta.data.fileType).toContain('text/plain')

    const range = await requestRaw('/api/files/hello.txt/content', {
      headers: { Range: 'bytes=6-10' },
    })
    expect(range.status).toBe(206)
    expect(range.headers['content-range']).toBe(`bytes 6-10/${source.size}`)
    await expect(range.text()).resolves.toBe('slice')
  })

  it('downloads a merged file through SliceDownload ajax-compatible range requests', async () => {
    const source = createFile('download through range', 'range.txt')
    const hashResult = await getHashChunks({
      chunkSize: 8,
      file: source,
      realChunkHash: false,
      realPreHash: false,
    })

    for (const chunk of hashResult.fileChunks) {
      const response = await postMultipart('/api/upload/chunk', {
        chunk: chunk.chunk,
        chunkHash: chunk.chunkHash,
        chunkSize: 8,
        chunkTotal: hashResult.fileChunks.length,
        filename: source.name,
        index: chunk.index,
        preHash: hashResult.preHash,
      })
      if (!response.ok) throw new Error(await response.text())
    }
    await postJson('/api/upload/merge', {
      chunkTotal: hashResult.fileChunks.length,
      filename: source.name,
      preHash: hashResult.preHash,
    })

    const meta = await getJson<{ data: { fileSize: number; fileType: string } }>(
      '/api/files/range.txt/meta',
    )
    const download = defineSliceDownload({
      autoSave: false,
      chunkSize: 6,
      fileSize: meta.data.fileSize,
      filename: source.name,
      fileType: meta.data.fileType,
      poolCount: 2,
    })
    let downloadedText = ''

    download.setDownloadRequest(async (params) => {
      const response = await requestRaw(`/api/files/${params.filename}/content`, {
        headers: { Range: `bytes=${params.start}-${params.end}` },
      })
      return await response.blob()
    })
    download.on('finish', async ({ file }) => {
      downloadedText = await file.text()
    })

    await download.start()

    expect(download.status).toBe('success')
    expect(downloadedText).toBe(await source.text())
  })

  it('handles HEAD, suffix ranges, and unsatisfiable ranges', async () => {
    await writeFile(join(storageDir, 'files', 'ranges.txt'), 'abcdef')

    const head = await requestRaw('/api/files/ranges.txt/content', { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers['content-length']).toBe('6')
    expect(head.body).toHaveLength(0)

    const suffix = await requestRaw('/api/files/ranges.txt/content', {
      headers: { Range: 'bytes=-2' },
    })
    expect(suffix.status).toBe(206)
    expect(suffix.headers['content-range']).toBe('bytes 4-5/6')
    await expect(suffix.text()).resolves.toBe('ef')

    const unsatisfiable = await requestRaw('/api/files/ranges.txt/content', {
      headers: { Range: 'bytes=10-12' },
    })
    expect(unsatisfiable.status).toBe(416)
    expect(unsatisfiable.headers['content-range']).toBe('bytes */6')
  })

  it('replaces retried chunks by index before verify and merge', async () => {
    const uploadFields = {
      chunkSize: 3,
      chunkTotal: 2,
      filename: 'retry.txt',
      preHash: 'retry-prehash',
    }

    expect(
      await postMultipart('/api/upload/chunk', {
        ...uploadFields,
        chunk: new Blob(['bad']),
        chunkHash: 'old-hash',
        index: 0,
      }).then((response) => response.ok),
    ).toBe(true)
    expect(
      await postMultipart('/api/upload/chunk', {
        ...uploadFields,
        chunk: new Blob(['new']),
        chunkHash: 'new-hash',
        index: 0,
      }).then((response) => response.ok),
    ).toBe(true)
    expect(
      await postMultipart('/api/upload/chunk', {
        ...uploadFields,
        chunk: new Blob(['ok']),
        chunkHash: 'tail-hash',
        index: 1,
      }).then((response) => response.ok),
    ).toBe(true)

    const verify = await postJson<{ data: string[] | true }>('/api/upload/verify', uploadFields)
    expect(verify.data).toBe(true)

    await postJson('/api/upload/merge', uploadFields)
    await expect(readFile(join(storageDir, 'files', 'retry.txt'), 'utf8')).resolves.toBe('newok')
  })

  it('requires chunkTotal for verify and merge', async () => {
    const verify = await requestRaw('/api/upload/verify', {
      body: JSON.stringify({ preHash: 'missing-total' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    expect(verify.status).toBe(400)
    await expect(verify.text()).resolves.toContain('chunkTotal must be an integer')

    const merge = await requestRaw('/api/upload/merge', {
      body: JSON.stringify({ filename: 'missing.txt', preHash: 'missing-total' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    expect(merge.status).toBe(400)
    await expect(merge.text()).resolves.toContain('chunkTotal must be an integer')
  })

  it('serves the checked-in mp4.zip fixture without publishing it as library code', async () => {
    await restartServer()
    const fixture = await readFile(fixturePath)
    const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04])

    expect(fixture.subarray(0, 4)).toEqual(zipMagic)
    const meta = await getJson<{ data: { fileSize: number; fileType: string } }>(
      '/api/files/mp4.zip/meta',
    )

    expect(meta.data.fileSize).toBe(fixture.byteLength)
    expect(meta.data.fileType).toBe('application/zip')

    const range = await requestRaw('/api/files/mp4.zip/content', {
      headers: { Range: 'bytes=0-15' },
    })

    expect(range.status).toBe(206)
    expect(range.body).toEqual(fixture.subarray(0, 16))
  })

  async function restartServer(options: Parameters<typeof createPlaygroundServer>[0] = {}) {
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await rm(storageDir, { force: true, recursive: true })
    storageDir = await mkdtemp(join(process.cwd(), 'temp', 'slice-upload-utils-'))
    await startServer(options)
  }

  async function startServer(options: Parameters<typeof createPlaygroundServer>[0] = {}) {
    server = createPlaygroundServer({ seedDemoFile: false, storageDir, ...options })
    await server.ready
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('server did not start')
    baseUrl = `http://127.0.0.1:${address.port}`
  }

  async function postJson<T = any>(path: string, body: unknown): Promise<T> {
    const response = await requestRaw(path, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    expect(response.ok).toBe(true)
    return (await response.json()) as T
  }

  async function getJson<T = any>(path: string): Promise<T> {
    const response = await requestRaw(path)
    expect(response.ok).toBe(true)
    return (await response.json()) as T
  }

  async function postMultipart(path: string, fields: Record<string, Blob | number | string>) {
    const { body, contentType } = await createMultipartBody(fields)
    return await requestRaw(path, {
      body,
      headers: { 'Content-Type': contentType },
      method: 'POST',
    })
  }

  async function createMultipartBody(fields: Record<string, Blob | number | string>) {
    const boundary = `----slice-upload-utils-${Math.random().toString(16).slice(2)}`
    const chunks: Buffer[] = []

    for (const [name, value] of Object.entries(fields)) {
      chunks.push(Buffer.from(`--${boundary}\r\n`))
      if (value instanceof Blob) {
        chunks.push(
          Buffer.from(
            [
              `Content-Disposition: form-data; name="${name}"; filename="${name}.bin"`,
              'Content-Type: application/octet-stream',
              '',
              '',
            ].join('\r\n'),
          ),
        )
        chunks.push(Buffer.from(await value.arrayBuffer()))
        chunks.push(Buffer.from('\r\n'))
      } else {
        chunks.push(
          Buffer.from(
            [`Content-Disposition: form-data; name="${name}"`, '', String(value), ''].join('\r\n'),
          ),
        )
      }
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`))
    return {
      body: Buffer.concat(chunks),
      contentType: `multipart/form-data; boundary=${boundary}`,
    }
  }

  function requestRaw(path: string, options: RawRequestOptions = {}) {
    const url = new URL(path, baseUrl)
    const body = normalizeBody(options.body)
    const headers = {
      ...options.headers,
      ...(body ? { 'Content-Length': String(body.byteLength) } : {}),
    }

    return new Promise<RawResponse>((resolve, reject) => {
      const req = httpRequest(
        url,
        {
          headers,
          method: options.method || 'GET',
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          res.on('error', reject)
          res.on('end', () => {
            const buffer = Buffer.concat(chunks)
            resolve({
              body: buffer,
              headers: res.headers,
              ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
              status: res.statusCode || 0,
              blob: async () =>
                new Blob([buffer], {
                  type: String(res.headers['content-type'] || 'application/octet-stream'),
                }),
              json: async <T = unknown>() => JSON.parse(buffer.toString('utf8')) as T,
              text: async () => buffer.toString('utf8'),
            })
          })
        },
      )
      req.on('error', reject)
      if (body) req.write(body)
      req.end()
    })
  }

  function normalizeBody(body: RawRequestOptions['body']) {
    if (!body) return null
    if (Buffer.isBuffer(body)) return body
    return Buffer.from(body)
  }
})

interface RawRequestOptions {
  body?: Buffer | string
  headers?: Record<string, string>
  method?: string
}

interface RawResponse {
  body: Buffer
  headers: import('node:http').IncomingHttpHeaders
  ok: boolean
  status: number
  blob: () => Promise<Blob>
  json: <T = unknown>() => Promise<T>
  text: () => Promise<string>
}
