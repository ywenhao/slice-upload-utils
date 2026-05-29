import { afterEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createApp, defineComponent, h, nextTick, onMounted, ref } from 'vue'
import {
  useSliceDownload as useReactSliceDownload,
  useSliceUpload as useReactSliceUpload,
} from '../src/react'
import {
  useSliceDownload as useVueSliceDownload,
  useSliceUpload as useVueSliceUpload,
} from '../src/vue'
import type { UseReactSliceDownloadReturn, UseReactSliceUploadReturn } from '../src/reactHooks'
import type { UseSliceDownloadOptions } from '../src/vueHooks'
import type { DownloadFinishParams, UploadFinishParams, UploadRequest } from '../src'
import { createFile, sleep, stubUrl, waitFor } from './helpers'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('React hooks', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    if (root) act(() => root!.unmount())
    container?.remove()
    root = null
    container = null
  })

  it('uploads, syncs state, accepts request updates, and destroys on unmount', async () => {
    const firstRequest = vi.fn<UploadRequest>(async () => false)
    const secondRequest = vi.fn<UploadRequest>(async () => undefined)
    const onFinish = vi.fn<(params: UploadFinishParams) => void>()
    const uploadFile = createFile('abcd')
    let hook!: UseReactSliceUploadReturn
    let setRequest!: (request: UploadRequest) => void

    function Harness() {
      const [request, updateRequest] = React.useState<UploadRequest>(() => firstRequest)
      setRequest = (nextRequest) => updateRequest(() => nextRequest)
      hook = useReactSliceUpload({
        chunkSize: 2,
        file: uploadFile,
        onFinish,
        request,
      })
      return null
    }

    await mountReact(<Harness />, () => expect(hook).toBeDefined())
    await act(async () => {
      await hook.start()
    })
    expect(hook.status).toBe('error')
    expect(firstRequest).toHaveBeenCalled()

    await act(async () => {
      setRequest(secondRequest)
      await sleep()
    })
    await act(async () => {
      await hook.start()
    })

    expect(secondRequest).toHaveBeenCalled()
    expect(hook.status).toBe('success')
    expect(hook.progress).toBe(100)
    expect(onFinish).toHaveBeenCalled()

    const instance = hook.instance
    act(() => root!.unmount())
    expect(instance.getFile()).toBeNull()
  })

  it('downloads and updates file options through the returned API', async () => {
    stubUrl()
    const onFinish = vi.fn<(params: DownloadFinishParams) => void>()
    let hook!: UseReactSliceDownloadReturn

    function Harness() {
      hook = useReactSliceDownload({
        autoSave: false,
        fileSize: 2,
        filename: 'first.txt',
        onFinish,
        request: async () => new Blob(['ok']),
      })
      return null
    }

    await mountReact(<Harness />, () => expect(hook).toBeDefined())
    await act(async () => {
      hook.setFileOptions({ filename: 'second.txt', fileSize: 2, fileType: 'text/plain' })
      await hook.start()
    })

    expect(hook.status).toBe('success')
    expect(hook.progress).toBe(100)
    expect(onFinish.mock.calls[0]![0].file.name).toBe('second.txt')
  })

  function mountReact(element: React.ReactElement, ready: () => void) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => root!.render(element))
    return waitFor(ready)
  }
})

describe('Vue hooks', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('uploads, reacts to file changes, supports request updates, and destroys on unmount', async () => {
    const firstRequest = vi.fn<UploadRequest>(async () => undefined)
    const secondRequest = vi.fn<UploadRequest>(async () => undefined)
    const file = ref<File | null>(createFile('abcd'))
    let api!: ReturnType<typeof useVueSliceUpload>

    const app = createApp(
      defineComponent({
        setup() {
          api = useVueSliceUpload({
            chunkSize: 2,
            file,
            request: firstRequest,
          })
          onMounted(async () => {
            await api.start()
          })
          return () => h('div')
        },
      }),
    )

    const host = document.createElement('div')
    document.body.append(host)
    app.mount(host)

    await waitFor(() => expect(api.status.value).toBe('success'))
    expect(firstRequest).toHaveBeenCalled()

    file.value = createFile('efgh')
    await nextTick()
    api.setRequest(secondRequest)
    await api.start()

    expect(secondRequest).toHaveBeenCalled()
    expect(api.status.value).toBe('success')
    expect(api.progress.value).toBe(100)

    const instance = api.instance
    app.unmount()
    expect(instance.getFile()).toBeNull()
  })

  it('downloads and updates file options through the returned API', async () => {
    stubUrl()
    let api!: ReturnType<typeof useVueSliceDownload>

    const options: UseSliceDownloadOptions = {
      autoSave: false,
      fileSize: 2,
      filename: 'first.txt',
      request: async () => new Blob(['ok']),
    }
    const app = createApp(
      defineComponent({
        setup() {
          api = useVueSliceDownload(options)
          return () => h('div')
        },
      }),
    )

    const host = document.createElement('div')
    document.body.append(host)
    app.mount(host)

    api.setFileOptions({ filename: 'second.txt', fileSize: 2, fileType: 'text/plain' })
    await api.start()

    expect(api.status.value).toBe('success')
    expect(api.progress.value).toBe(100)
    app.unmount()
  })
})
