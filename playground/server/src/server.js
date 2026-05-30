import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const defaultStorageDir = resolve(currentDir, '../.data')
const defaultFixturesDir = resolve(currentDir, '../../fixtures')
const uploadDirName = 'uploads'
const fileDirName = 'files'

export function createPlaygroundServer(options = {}) {
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
      const status = error.status || 500
      sendJson(res, status, {
        code: status,
        message: error.message || 'Internal server error',
      })
    }
  })

  server.ready = ready
  server.storageDir = storageDir
  return server
}

export async function startPlaygroundServer(options = {}) {
  const port = Number(options.port || process.env.PORT || 10010)
  const host = options.host || process.env.HOST || '127.0.0.1'
  const server = createPlaygroundServer(options)
  await server.ready
  await new Promise((resolve) => server.listen(port, host, resolve))
  console.log(`slice-upload-utils playground server: http://${host}:${port}`)
  return server
}

async function handleUploadVerify(req, res, storageDir) {
  const body = await readJson(req)
  const preHash = requireString(body.preHash, 'preHash')
  const chunkTotal = Number(body.chunkTotal || 0)
  const chunks = await getUploadedChunks(storageDir, preHash)
  const chunkHashes = chunks.map((chunk) => chunk.chunkHash)
  const data = chunkTotal > 0 && chunks.length >= chunkTotal ? true : chunkHashes

  sendJson(res, 200, { code: 200, data })
}

async function handleUploadChunk(req, res, storageDir) {
  const form = await readFormData(req)
  const preHash = requireString(form.get('preHash'), 'preHash')
  const filename = sanitizeFilename(requireString(form.get('filename'), 'filename'))
  const chunkHash = sanitizeId(requireString(form.get('chunkHash'), 'chunkHash'))
  const index = requireNumber(form.get('index'), 'index')
  const chunkTotal = requireNumber(form.get('chunkTotal'), 'chunkTotal')
  const chunkSize = Number(form.get('chunkSize') || 0)
  const chunk = form.get('chunk')

  if (!chunk || typeof chunk.arrayBuffer !== 'function') {
    throw new HttpError(400, 'chunk must be a Blob or File')
  }

  const dir = getUploadDir(storageDir, preHash)
  await mkdir(dir, { recursive: true })
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

async function handleUploadMerge(req, res, storageDir) {
  const body = await readJson(req)
  const preHash = requireString(body.preHash, 'preHash')
  const filename = sanitizeFilename(requireString(body.filename, 'filename'))
  const chunkTotal = Number(body.chunkTotal || 0)
  const chunks = await getUploadedChunks(storageDir, preHash)

  if (!chunks.length) throw new HttpError(404, 'No uploaded chunks found')
  if (chunkTotal > 0 && chunks.length < chunkTotal) {
    const indexes = new Set(chunks.map((chunk) => chunk.index))
    const missing = Array.from({ length: chunkTotal }, (_, index) => index).filter(
      (index) => !indexes.has(index),
    )
    throw new HttpError(409, `Missing chunks: ${missing.join(', ')}`)
  }

  const target = getFilePath(storageDir, filename)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, Buffer.alloc(0))
  for (const chunk of chunks) {
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

async function handleFileMeta(res, storageDir, encodedFilename) {
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

async function handleFileContent(req, res, storageDir, encodedFilename) {
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

async function ensureStorage(storageDir, options) {
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
    if (error.code !== 'ENOENT') throw error
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

async function copyFixtureFiles(fixturesDir, filesDir) {
  let fixtures = []
  try {
    fixtures = await readdir(fixturesDir, { withFileTypes: true })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
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

async function assertFixtureReady(filename, source) {
  const fileStat = await stat(source)
  if (fileStat.size > 512) return

  const content = await readFile(source, 'utf8')
  if (!isGitLfsPointer(content)) return

  throw new Error(
    `${filename} is still a Git LFS pointer. Run: git lfs pull --include=playground/fixtures/${filename}`,
  )
}

function isGitLfsPointer(content) {
  return content.startsWith('version https://git-lfs.github.com/spec/v1\n')
}

async function getUploadedChunks(storageDir, preHash) {
  const dir = getUploadDir(storageDir, preHash)
  let files = []
  try {
    files = await readdir(dir)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return []
  }

  return files
    .map((file) => {
      const match = file.match(/^(\d+)-(.+)\.part$/)
      if (!match) return null
      return {
        chunkHash: match[2],
        index: Number(match[1]),
        path: join(dir, file),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index)
}

async function readJson(req) {
  const raw = (await readBodyBuffer(req)).toString('utf8')
  if (!raw) return {}

  try {
    return JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

async function readFormData(req) {
  const contentType = String(req.headers['content-type'] || '')
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2]
  if (!boundary) throw new HttpError(400, 'Missing multipart boundary')

  const body = (await readBodyBuffer(req)).toString('latin1')
  const form = new Map()

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

async function readBodyBuffer(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function parseRange(rangeHeader, fileSize) {
  if (!rangeHeader) return null
  const match = String(rangeHeader).match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return { unsatisfiable: true }

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

async function getRequiredStat(path) {
  try {
    return await stat(path)
  } catch (error) {
    if (error.code === 'ENOENT') throw new HttpError(404, 'File not found')
    throw error
  }
}

function getUploadDir(storageDir, preHash) {
  return join(storageDir, uploadDirName, sanitizeId(preHash))
}

function getFilePath(storageDir, filename) {
  return join(storageDir, fileDirName, sanitizeFilename(filename))
}

function getChunkFilename(index, chunkHash) {
  return `${index}-${sanitizeId(chunkHash)}.part`
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${name} is required`)
  return value
}

function requireNumber(value, name) {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new HttpError(400, `${name} must be a number`)
  return number
}

function sanitizeFilename(filename) {
  const safe = basename(String(filename || 'download.bin'))
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '_')
    .trim()
  return safe || 'download.bin'
}

function sanitizeId(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_')
}

function getContentType(filename) {
  const ext = extname(filename).toLowerCase()
  const contentTypes = {
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

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,HEAD,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Range')
  res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges,Content-Length,Content-Range')
  if (origin !== '*') res.setHeader('Vary', 'Origin')
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(body)
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export async function clearPlaygroundStorage(storageDir = join(tmpdir(), 'slice-upload-utils')) {
  await rm(storageDir, { force: true, recursive: true })
}
