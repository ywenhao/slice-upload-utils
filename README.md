# slice-upload-utils

[![NPM version](https://img.shields.io/npm/v/slice-upload-utils?color=a1b858&label=)](https://www.npmjs.com/package/slice-upload-utils)

English | [简体中文](./README.zh-CN.md)

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ywenhao/slice-upload-utils/des.png" />
</p>

## Introduction

`slice-upload-utils` provides large-file sliced upload, sliced download, resumable upload, instant upload, pause, cancel, and Vue / React hooks.

On upload, files are split into chunks and assigned a `preHash` and `chunkHash`. By default, the library uses sampled hashes, which fit most business scenarios. Enable `realPreHash` or `realChunkHash` when strict verification is required, at the cost of more hashing time.

On download, the library sends concurrent HTTP Range requests, merges chunks in order into a `File`, and saves it automatically by default.

## Installation

```shell
pnpm add slice-upload-utils
```

## Entrypoints

```ts
import { defineSliceDownload, defineSliceUpload } from 'slice-upload-utils'
import { useSliceDownload, useSliceUpload } from 'slice-upload-utils/vue'
import { useSliceDownload as useReactSliceDownload } from 'slice-upload-utils/react'
```

Vue hooks are still exported from the main entrypoint for compatibility. New code should prefer explicit sub-entry imports such as `slice-upload-utils/vue` and `slice-upload-utils/react`.

The package only ships ESM builds. It is recommended for Vite, Nuxt, Next, modern Node ESM, or other bundlers/runtimes that support ESM.

## Local Playground

```shell
pnpm dev
```

`pnpm dev` starts both:

- Vue example app: `playground/vue`
- Local upload/download server: `playground/server`

The Vue example accesses `/api` through the Vite proxy. The server runs at `http://127.0.0.1:10010`.

The repository includes `playground/fixtures/mp4.zip`, which is exposed by the server as a test download file. It is a Git LFS file and is only used by the GitHub repository, playground, and tests. The npm package only includes `dist`, so this fixture is not published.

Before the first checkout, install and enable Git LFS so `git pull` replaces LFS pointer files with real files:

```shell
git lfs install
git pull
```

If you already checked out the 134-byte pointer file, run:

```shell
git lfs pull --include=playground/fixtures/mp4.zip
```

## Upload Usage

Use `params.ajaxRequest` inside your `request` function. It is already bound to the current chunk and works correctly with concurrent uploads, async pre-checks, retries, pause, and cancel.

### Vue

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { PreVerifyUploadParams, UploadFinishParams, UploadParams } from 'slice-upload-utils'
import { useSliceUpload } from 'slice-upload-utils/vue'

const file = ref<File>()
const chunkSize = 1024 ** 2 * 2

const { progress, status, start, pause, cancel } = useSliceUpload({
  chunkSize,
  file,
  request: uploadChunk,
  preVerifyRequest,
  onFinish: mergeChunks,
})

async function preVerifyRequest(params: PreVerifyUploadParams) {
  const result = await fetch('/api/upload/verify', {
    body: JSON.stringify(params),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  }).then((res) => res.json())

  return result.data as string[] | true
}

async function uploadChunk(params: UploadParams) {
  const { ajaxRequest, ...fields } = params
  const data = new FormData()

  data.append('chunkSize', String(chunkSize))
  Object.entries(fields).forEach(([key, value]) => {
    if (value === null || value === undefined) return
    data.append(key, typeof value === 'number' ? String(value) : value)
  })

  const result = await ajaxRequest<{ code: number }>({
    data,
    url: '/api/upload/chunk',
  })

  return result.code === 200
}

async function mergeChunks(params: UploadFinishParams) {
  await fetch('/api/upload/merge', {
    body: JSON.stringify(params),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
}

function handleFileChange(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0]
}
</script>

<template>
  <input type="file" @change="handleFileChange" />
  <button :disabled="status === 'uploading'" @click="start">Upload</button>
  <button @click="pause">Pause</button>
  <button @click="cancel">Cancel</button>
  <progress :value="progress" max="100" />
</template>
```

### React

```tsx
import { useState } from 'react'
import type { PreVerifyUploadParams, UploadFinishParams, UploadParams } from 'slice-upload-utils'
import { useSliceUpload } from 'slice-upload-utils/react'

const chunkSize = 1024 ** 2 * 2

export function UploadPanel() {
  const [file, setFile] = useState<File | null>(null)
  const upload = useSliceUpload({
    chunkSize,
    file,
    request: uploadChunk,
    preVerifyRequest,
    onFinish: mergeChunks,
  })

  return (
    <>
      <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <button disabled={upload.status === 'uploading'} onClick={upload.start}>
        Upload
      </button>
      <button onClick={upload.pause}>Pause</button>
      <button onClick={upload.cancel}>Cancel</button>
      <progress value={upload.progress} max="100" />
    </>
  )
}

async function preVerifyRequest(params: PreVerifyUploadParams) {
  const result = await fetch('/api/upload/verify', {
    body: JSON.stringify(params),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  }).then((res) => res.json())

  return result.data as string[] | true
}

async function uploadChunk(params: UploadParams) {
  const { ajaxRequest, ...fields } = params
  const data = new FormData()

  data.append('chunkSize', String(chunkSize))
  Object.entries(fields).forEach(([key, value]) => {
    if (value === null || value === undefined) return
    data.append(key, typeof value === 'number' ? String(value) : value)
  })

  const result = await ajaxRequest<{ code: number }>({
    data,
    url: '/api/upload/chunk',
  })

  return result.code === 200
}

async function mergeChunks(params: UploadFinishParams) {
  await fetch('/api/upload/merge', {
    body: JSON.stringify(params),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
}
```

Common `useSliceUpload` return values:

```ts
const { start, pause, cancel, chunks, progress, status, instance } = upload
```

## Download Usage

Before downloading, usually fetch file metadata first, call `setFileOptions`, then call `start()`. `params.ajaxRequest` automatically sends the current chunk `Range` header.

### Vue

```vue
<script setup lang="ts">
import type { DownloadParams } from 'slice-upload-utils'
import { useSliceDownload } from 'slice-upload-utils/vue'

const filename = 'mp4.zip'

const { progress, status, start, pause, cancel, setFileOptions } = useSliceDownload({
  autoSave: true,
  request: downloadChunk,
})

async function downloadChunk(params: DownloadParams) {
  return params.ajaxRequest<Blob>({
    url: `/api/files/${encodeURIComponent(params.filename)}/content`,
  })
}

async function handleDownload() {
  const meta = await fetch(`/api/files/${encodeURIComponent(filename)}/meta`)
    .then((res) => res.json())
    .then((res) => res.data)

  setFileOptions({
    filename: meta.filename,
    fileSize: meta.fileSize,
    fileType: meta.fileType,
  })
  await start()
}
</script>

<template>
  <button :disabled="status === 'downloading'" @click="handleDownload">Download</button>
  <button @click="pause">Pause</button>
  <button @click="cancel">Cancel</button>
  <progress :value="progress" max="100" />
</template>
```

### React

```tsx
import type { DownloadParams } from 'slice-upload-utils'
import { useSliceDownload } from 'slice-upload-utils/react'

function DownloadButton() {
  const download = useSliceDownload({
    autoSave: true,
    request: downloadChunk,
  })

  async function downloadChunk(params: DownloadParams) {
    return params.ajaxRequest<Blob>({
      url: `/api/files/${encodeURIComponent(params.filename)}/content`,
    })
  }

  async function handleDownload() {
    const meta = await fetch('/api/files/mp4.zip/meta')
      .then((res) => res.json())
      .then((res) => res.data)

    download.setFileOptions({
      filename: meta.filename,
      fileSize: meta.fileSize,
      fileType: meta.fileType,
    })
    await download.start()
  }

  return (
    <>
      <button disabled={download.status === 'downloading'} onClick={handleDownload}>
        Download
      </button>
      <button onClick={download.pause}>Pause</button>
      <button onClick={download.cancel}>Cancel</button>
      <progress value={download.progress} max="100" />
    </>
  )
}
```

Common `useSliceDownload` return values:

```ts
const { start, pause, cancel, setFileOptions, chunks, progress, status, instance } = download
```

## Server Protocol

This repository includes a dependency-free Node playground server that can be used as a backend protocol reference.

### `POST /api/upload/verify`

Request body:

```json
{
  "preHash": "file-hash",
  "filename": "demo.txt",
  "chunkSize": 2097152,
  "chunkTotal": 10
}
```

Response:

```json
{
  "code": 200,
  "data": ["uploaded-chunk-hash"]
}
```

When every chunk is already present, `data` returns `true` and the client enters the finished state directly.

### `POST /api/upload/chunk`

`multipart/form-data` fields:

- `chunk`
- `index`
- `chunkTotal`
- `preHash`
- `filename`
- `chunkHash`
- `chunkSize`

### `POST /api/upload/merge`

Call this after upload finishes. The server merges chunks by `index`:

```json
{
  "preHash": "file-hash",
  "filename": "demo.txt",
  "chunkSize": 2097152,
  "chunkTotal": 10
}
```

### `GET /api/files/:filename/meta`

Returns file metadata needed before download:

```json
{
  "code": 200,
  "data": {
    "filename": "demo.txt",
    "fileSize": 1024,
    "fileType": "text/plain; charset=utf-8",
    "url": "/api/files/demo.txt/content"
  }
}
```

### `GET /api/files/:filename/content`

Supports `Range: bytes=start-end`. Sliced downloads automatically send the Range header.

## API Overview

### Upload Options

```ts
interface UseSliceUploadOptions {
  /**
   * File to upload.
   */
  file: Ref<File | null | undefined>
  /**
   * Upload request function.
   */
  request: UploadRequest
  /**
   * Error handler.
   */
  onError?: UploadEventType['error']
  /**
   * Finish handler.
   */
  onFinish?: UploadEventType['finish']
  /**
   * Pre-verify function.
   */
  preVerifyRequest?: PreVerifyUploadRequest
  /**
   * Chunk size in bytes.
   * @default 1024 * 1024 * 2 bytes
   */
  chunkSize?: number
  /**
   * Upload concurrency.
   * @default 3
   */
  poolCount?: number
  /**
   * Request retry count after failure.
   * @default 3
   */
  retryCount?: number
  /**
   * Request retry delay after failure, in milliseconds.
   * @default 300 ms
   */
  retryDelay?: number
  /**
   * Request timeout in milliseconds.
   * @default 15000 ms
   */
  timeout?: number
  /**
   * Hash the full file. Slower when enabled.
   * @default false
   */
  realPreHash?: boolean
  /**
   * Hash every chunk. Slower when enabled.
   * @default false
   */
  realChunkHash?: boolean
}
```

### Download Options

```ts
interface UseSliceDownloadOptions {
  /**
   * File size in bytes.
   */
  fileSize?: number
  /**
   * File name.
   */
  filename?: string
  /**
   * File MIME type.
   * @default application/octet-stream
   * @see https://developer.mozilla.org/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
   */
  fileType?: string
  /**
   * Whether to save automatically.
   * @default true
   */
  autoSave?: boolean
  /**
   * Chunk size in bytes.
   * @default 1024 * 1024 * 2 bytes
   */
  chunkSize?: number
  /**
   * Download concurrency.
   * @default 3
   */
  poolCount?: number
  /**
   * Request retry count after failure.
   * @default 3
   */
  retryCount?: number
  /**
   * Request retry delay after failure, in milliseconds.
   * @default 300 ms
   */
  retryDelay?: number
  /**
   * Request timeout in milliseconds.
   * @default 15000 ms
   */
  timeout?: number
  /**
   * Download request function.
   */
  request: DownloadRequest
  /**
   * Error handler.
   */
  onError?: DownloadEventType['error']
  /**
   * Finish handler.
   */
  onFinish?: DownloadEventType['finish']
}
```

## Verification

```shell
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm build
```

## License

[MIT](./LICENSE) License © 2023 [Ywenhao](https://github.com/ywenhao)
