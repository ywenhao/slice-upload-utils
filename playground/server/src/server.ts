import { createReadStream, type Dirent } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

export interface PlaygroundServerOptions {
  fixturesDir?: string
  host?: string
  port?: number
  seedDemoFile?: boolean
  storageDir?: string
}

export interface PlaygroundServer extends Server {
  ready: Promise<void>
  storageDir: string
}

interface StorageOptions {
  fixturesDir: string
  seedDemoFile: boolean
}

interface UploadedChunk {
  chunkHash: string
  index: number
  path: string
}

interface UploadChunkIssues {
  duplicateIndexes: number[]
  missingIndexes: number[]
}

interface MultipartFile {
  name: string
  size: number
  type: string
  arrayBuffer: () => Promise<ArrayBufferLike>
}

type MultipartForm = Map<string, string | MultipartFile>

interface ByteRange {
  end: number
  start: number
  unsatisfiable?: false
}

interface UnsatisfiableRange {
  unsatisfiable: true
}

type ParsedRange = ByteRange | UnsatisfiableRange | null

const currentDir = dirname(fileURLToPath(import.meta.url))
const defaultStorageDir = resolve(currentDir, '../.data')
const defaultFixturesDir = resolve(currentDir, '../../fixtures')
const uploadDirName = 'uploads'
const fileDirName = 'files'

export function createPlaygroundServer(options: PlaygroundServerOptions = {}): PlaygroundServer {
  const storageDir = resolve(options.storageDir || defaultStorageDir)
  const fixturesDir = resolve(options.fixturesDir || defaultFixturesDir)
  const seedDemoFile = options.seedDemoFile !== false
  const ready = ensureStorage(storageDir, { fixturesDir, seedDemoFile })

  const server = createServer(async (req, res) => {
    setCorsHeaders(req, res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    try {
      await ready

      const url = new URL(req.url || '/', 'http://localhost')
      if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, { code: 200, data: { ok: true } })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/upload/verify') {
        await handleUploadVerify(req, res, storageDir)
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/upload/chunk') {
        await handleUploadChunk(req, res, storageDir)
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/upload/merge') {
        await handleUploadMerge(req, res, storageDir)
        return
      }

      const metaMatch = url.pathname.match(/^\/api\/files\/(.+)\/meta$/)
      if (req.method === 'GET' && metaMatch) {
        await handleFileMeta(res, storageDir, metaMatch[1])
        return
      }

      const contentMatch = url.pathname.match(/^\/api\/files\/(.+)\/content$/)
      if ((req.method === 'GET' || req.method === 'HEAD') && contentMatch) {
        await handleFileContent(req, res, storageDir, contentMatch[1])
        return
      }

      sendJson(res, 404, { code: 404, message: 'Not found' })
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      sendJson(res, status, {
        code: status,
        message: error instanceof Error ? error.message : 'Internal server error',
      })
    }
  }) as PlaygroundServer

  server.ready = ready
  server.storageDir = storageDir
  return server
}

export async function startPlaygroundServer(
  options: PlaygroundServerOptions = {},
): Promise<PlaygroundServer> {
  const port = Number(options.port || process.env.PORT || 10010)
  const host = options.host || process.env.HOST || '127.0.0.1'
  const server = createPlaygroundServer(options)
  await server.ready
  await new Promise<void>((resolve) => server.listen(port, host, resolve))
  console.log(`slice-upload-utils playground server: http://${host}:${port}`)
  return server
}

async function handleUploadVerify(req: IncomingMessage, res: ServerResponse, storageDir: string) {
  const body = await readJson(req)
  const preHash = requireString(body.preHash, 'preHash')
  const chunkTotal = requirePositiveInteger(body.chunkTotal, 'chunkTotal')
  const chunks = await getUploadedChunks(storageDir, preHash)
  // 完整且连续的 index 集合表示可秒传；否则只返回可安全复用的分片 hash。
  const completeChunks = getCompleteUploadChunks(chunks, chunkTotal)
  const data = completeChunks ? true : getResumableUploadChunks(chunks, chunkTotal)

  sendJson(res, 200, { code: 200, data })
}

async function handleUploadChunk(req: IncomingMessage, res: ServerResponse, storageDir: string) {
  const form = await readFormData(req)
  const preHash = requireString(form.get('preHash'), 'preHash')
  const filename = sanitizeFilename(requireString(form.get('filename'), 'filename'))
  const chunkHash = sanitizeId(requireString(form.get('chunkHash'), 'chunkHash'))
  const index = requireInteger(form.get('index'), 'index')
  const chunkTotal = requireInteger(form.get('chunkTotal'), 'chunkTotal')
  const chunkSize = requireInteger(form.get('chunkSize'), 'chunkSize')
  const chunk = form.get('chunk')

  if (chunkTotal <= 0) throw new HttpError(400, 'chunkTotal must be greater than 0')
  if (chunkSize <= 0) throw new HttpError(400, 'chunkSize must be greater than 0')
  if (index < 0 || index >= chunkTotal) {
    throw new HttpError(400, 'index must be within chunkTotal')
  }

  if (!isMultipartFile(chunk)) {
    throw new HttpError(400, 'chunk must be a Blob or File')
  }

  const dir = getUploadDir(storageDir, preHash)
  await mkdir(dir, { recursive: true })
  // 重试可能用新 hash 发送同一 index，服务端只保留每个 index 的当前分片。
  await removeUploadedChunkIndex(dir, index)
  await writeFile(
    join(dir, getChunkFilename(index, chunkHash)),
    Buffer.from(await chunk.arrayBuffer()),
  )
  await writeFile(
    join(dir, 'meta.json'),
    JSON.stringify(
      {
        filename,
        chunkSize,
        chunkTotal,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )

  sendJson(res, 200, {
    code: 200,
    data: {
      chunkHash,
      filename,
      index,
      uploaded: true,
    },
  })
}

async function handleUploadMerge(req: IncomingMessage, res: ServerResponse, storageDir: string) {
  const body = await readJson(req)
  const preHash = requireString(body.preHash, 'preHash')
  const filename = sanitizeFilename(requireString(body.filename, 'filename'))
  const chunkTotal = requirePositiveInteger(body.chunkTotal, 'chunkTotal')
  const chunks = await getUploadedChunks(storageDir, preHash)
  const completeChunks = getCompleteUploadChunks(chunks, chunkTotal)

  if (!chunks.length) throw new HttpError(404, 'No uploaded chunks found')
  // 只在 0..chunkTotal-1 每个 index 都存在且只存在一次时合并。
  if (!completeChunks) {
    const { duplicateIndexes, missingIndexes } = getUploadChunkIssues(chunks, chunkTotal)
    const messages = []
    if (missingIndexes.length) messages.push(`Missing chunks: ${missingIndexes.join(', ')}`)
    if (duplicateIndexes.length)
      messages.push(`Duplicate chunk indexes: ${duplicateIndexes.join(', ')}`)
    throw new HttpError(409, messages.join('; '))
  }

  const target = getFilePath(storageDir, filename)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, Buffer.alloc(0))
  for (const chunk of completeChunks) {
    const buffer = await readFile(chunk.path)
    await writeFile(target, buffer, { flag: 'a' })
  }

  const fileStat = await stat(target)
  sendJson(res, 200, {
    code: 200,
    data: {
      filename,
      fileSize: fileStat.size,
      fileType: getContentType(filename),
      metaUrl: `/api/files/${encodeURIComponent(filename)}/meta`,
      url: `/api/files/${encodeURIComponent(filename)}/content`,
    },
  })
}

async function handleFileMeta(res: ServerResponse, storageDir: string, encodedFilename: string) {
  const filename = sanitizeFilename(decodeURIComponent(encodedFilename))
  const target = getFilePath(storageDir, filename)
  const fileStat = await getRequiredStat(target)

  sendJson(res, 200, {
    code: 200,
    data: {
      filename,
      fileSize: fileStat.size,
      fileType: getContentType(filename),
      url: `/api/files/${encodeURIComponent(filename)}/content`,
    },
  })
}

async function handleFileContent(
  req: IncomingMessage,
  res: ServerResponse,
  storageDir: string,
  encodedFilename: string,
) {
  const filename = sanitizeFilename(decodeURIComponent(encodedFilename))
  const target = getFilePath(storageDir, filename)
  const fileStat = await getRequiredStat(target)
  const contentType = getContentType(filename)
  const range = parseRange(req.headers.range, fileStat.size)

  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Type', contentType)

  if (!range) {
    res.writeHead(200, { 'Content-Length': fileStat.size })
    if (req.method === 'HEAD') res.end()
    else createReadStream(target).pipe(res)
    return
  }

  if (range.unsatisfiable) {
    res.writeHead(416, { 'Content-Range': `bytes */${fileStat.size}` })
    res.end()
    return
  }

  const { start, end } = range
  res.writeHead(206, {
    'Content-Length': end - start + 1,
    'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
  })
  if (req.method === 'HEAD') res.end()
  else createReadStream(target, { start, end }).pipe(res)
}

async function ensureStorage(storageDir: string, options: StorageOptions) {
  const { fixturesDir, seedDemoFile } = options
  const filesDir = join(storageDir, fileDirName)
  await mkdir(join(storageDir, uploadDirName), { recursive: true })
  await mkdir(filesDir, { recursive: true })

  await copyFixtureFiles(fixturesDir, filesDir)

  if (!seedDemoFile) return

  const demoFile = join(filesDir, 'demo.txt')
  try {
    await stat(demoFile)
  } catch (error) {
    if (!isNodeError(error, 'ENOENT')) throw error
    await writeFile(
      demoFile,
      [
        'slice-upload-utils playground file',
        'This file is served with HTTP Range support.',
        'Upload a file, merge it, then download it by filename.',
        '',
      ].join('\n'),
    )
  }
}

async function copyFixtureFiles(fixturesDir: string, filesDir: string) {
  let fixtures: Dirent[] = []
  try {
    fixtures = await readdir(fixturesDir, { withFileTypes: true })
  } catch (error) {
    if (!isNodeError(error, 'ENOENT')) throw error
    return
  }

  for (const fixture of fixtures) {
    if (!fixture.isFile()) continue
    const source = join(fixturesDir, fixture.name)
    const target = join(filesDir, sanitizeFilename(fixture.name))
    await assertFixtureReady(fixture.name, source)
    await copyFile(source, target)
  }
}

async function assertFixtureReady(filename: string, source: string) {
  const fileStat = await stat(source)
  if (fileStat.size > 512) return

  const content = await readFile(source, 'utf8')
  if (!isGitLfsPointer(content)) return

  throw new Error(
    `${filename} is still a Git LFS pointer. Run: git lfs pull --include=playground/fixtures/${filename}`,
  )
}

function isGitLfsPointer(content: string) {
  return content.startsWith('version https://git-lfs.github.com/spec/v1\n')
}

async function getUploadedChunks(storageDir: string, preHash: string): Promise<UploadedChunk[]> {
  const dir = getUploadDir(storageDir, preHash)
  let files: string[] = []
  try {
    files = await readdir(dir)
  } catch (error) {
    if (!isNodeError(error, 'ENOENT')) throw error
    return []
  }

  return files
    .flatMap((file) => {
      const match = file.match(/^(\d+)-(.+)\.part$/)
      if (!match) return []
      return [
        {
          chunkHash: match[2]!,
          index: Number(match[1]),
          path: join(dir, file),
        },
      ]
    })
    .sort((a, b) => a.index - b.index)
}

async function removeUploadedChunkIndex(dir: string, index: number) {
  const files = await readdir(dir)
  await Promise.all(
    files
      .filter((file) => file.startsWith(`${index}-`) && file.endsWith('.part'))
      .map((file) => rm(join(dir, file), { force: true })),
  )
}

function getCompleteUploadChunks(
  chunks: UploadedChunk[],
  chunkTotal: number,
): UploadedChunk[] | null {
  if (!Number.isSafeInteger(chunkTotal) || chunkTotal <= 0) return null

  const { duplicateIndexes, missingIndexes } = getUploadChunkIssues(chunks, chunkTotal)
  if (duplicateIndexes.length || missingIndexes.length) return null

  // 按合并顺序返回，不依赖文件系统读取顺序。
  const chunksByIndex = new Map(chunks.map((chunk) => [chunk.index, chunk]))
  return Array.from({ length: chunkTotal }, (_, index) => chunksByIndex.get(index)!)
}

function getResumableUploadChunks(chunks: UploadedChunk[], chunkTotal: number) {
  if (!Number.isSafeInteger(chunkTotal) || chunkTotal <= 0)
    return chunks.map((chunk) => chunk.chunkHash)

  const counts = getUploadChunkIndexCounts(chunks, chunkTotal)
  return chunks.filter((chunk) => counts.get(chunk.index) === 1).map((chunk) => chunk.chunkHash)
}

function getUploadChunkIssues(chunks: UploadedChunk[], chunkTotal: number): UploadChunkIssues {
  const counts = getUploadChunkIndexCounts(chunks, chunkTotal)
  const missingIndexes = []
  const duplicateIndexes = []

  for (let index = 0; index < chunkTotal; index++) {
    const count = counts.get(index) || 0
    if (count === 0) missingIndexes.push(index)
    if (count > 1) duplicateIndexes.push(index)
  }

  return { duplicateIndexes, missingIndexes }
}

function getUploadChunkIndexCounts(chunks: UploadedChunk[], chunkTotal: number) {
  const counts = new Map<number, number>()

  chunks.forEach((chunk) => {
    if (chunk.index < 0 || chunk.index >= chunkTotal) return
    counts.set(chunk.index, (counts.get(chunk.index) || 0) + 1)
  })

  return counts
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = (await readBodyBuffer(req)).toString('utf8')
  if (!raw) return {}

  try {
    return JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

async function readFormData(req: IncomingMessage): Promise<MultipartForm> {
  const contentType = String(req.headers['content-type'] || '')
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2]
  if (!boundary) throw new HttpError(400, 'Missing multipart boundary')

  // playground 不引入 multipart 依赖；latin1 可在拆 headers 时保留二进制字节值。
  const body = (await readBodyBuffer(req)).toString('latin1')
  const form: MultipartForm = new Map()

  for (let part of body.split(`--${boundary}`)) {
    if (!part || part === '--\r\n' || part === '--') continue
    if (part.startsWith('\r\n')) part = part.slice(2)
    if (part.endsWith('--\r\n')) part = part.slice(0, -4)
    else if (part.endsWith('\r\n')) part = part.slice(0, -2)

    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd < 0) continue

    const rawHeaders = part.slice(0, headerEnd)
    const rawBody = part.slice(headerEnd + 4)
    const disposition = rawHeaders.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || ''
    const name = disposition.match(/name="([^"]+)"/)?.[1]
    if (!name) continue

    const filename = disposition.match(/filename="([^"]*)"/)?.[1]
    if (filename !== undefined) {
      const type =
        rawHeaders.match(/content-type:\s*([^\r\n]+)/i)?.[1] || 'application/octet-stream'
      const buffer = Buffer.from(rawBody, 'latin1')
      form.set(name, {
        name: filename,
        size: buffer.byteLength,
        type,
        arrayBuffer: async () =>
          buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      })
    } else {
      form.set(name, Buffer.from(rawBody, 'latin1').toString('utf8'))
    }
  }

  return form
}

async function readBodyBuffer(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function parseRange(rangeHeader: string | string[] | undefined, fileSize: number): ParsedRange {
  if (!rangeHeader) return null
  const match = String(rangeHeader).match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return { unsatisfiable: true }

  // 支持普通 Range 和 `bytes=-1024` 这类 suffix range。
  let start = match[1] === '' ? 0 : Number(match[1])
  let end = match[2] === '' ? fileSize - 1 : Number(match[2])
  if (match[1] === '' && match[2] !== '') {
    const suffixLength = Number(match[2])
    start = Math.max(fileSize - suffixLength, 0)
    end = fileSize - 1
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= fileSize || start > end) {
    return { unsatisfiable: true }
  }

  return {
    start: Math.max(start, 0),
    end: Math.min(end, fileSize - 1),
  }
}

async function getRequiredStat(path: string) {
  try {
    return await stat(path)
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) throw new HttpError(404, 'File not found')
    throw error
  }
}

function getUploadDir(storageDir: string, preHash: string) {
  return join(storageDir, uploadDirName, sanitizeId(preHash))
}

function getFilePath(storageDir: string, filename: string) {
  return join(storageDir, fileDirName, sanitizeFilename(filename))
}

function getChunkFilename(index: number, chunkHash: string) {
  return `${index}-${sanitizeId(chunkHash)}.part`
}

function requireString(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${name} is required`)
  return value
}

function requireInteger(value: unknown, name: string) {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new HttpError(400, `${name} must be an integer`)
  return number
}

function requirePositiveInteger(value: unknown, name: string) {
  const number = requireInteger(value, name)
  if (number <= 0) throw new HttpError(400, `${name} must be greater than 0`)
  return number
}

function sanitizeFilename(filename: unknown) {
  const safe = basename(String(filename || 'download.bin'))
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '_')
    .trim()
  return safe || 'download.bin'
}

function sanitizeId(value: unknown) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_')
}

function getContentType(filename: string) {
  const ext = extname(filename).toLowerCase()
  const contentTypes: Record<string, string> = {
    '.css': 'text/css',
    '.csv': 'text/csv',
    '.gif': 'image/gif',
    '.htm': 'text/html',
    '.html': 'text/html',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json',
    '.mp4': 'video/mp4',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
    '.zip': 'application/zip',
  }
  return contentTypes[ext] || 'application/octet-stream'
}

function isMultipartFile(value: unknown): value is MultipartFile {
  return (
    value !== null &&
    typeof value === 'object' &&
    'arrayBuffer' in value &&
    typeof value.arrayBuffer === 'function'
  )
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,HEAD,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Range')
  res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges,Content-Length,Content-Range')
  if (origin !== '*') res.setHeader('Vary', 'Origin')
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(body)
}

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code
}

export async function clearPlaygroundStorage(storageDir = join(tmpdir(), 'slice-upload-utils')) {
  await rm(storageDir, { force: true, recursive: true })
}
