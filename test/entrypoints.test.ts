import { describe, expect, it } from 'vitest'

describe('package entrypoints', () => {
  it('exposes core and legacy Vue hooks from the main source entry', async () => {
    const main = await import('../src')

    expect(main.defineSliceUpload).toBeTypeOf('function')
    expect(main.defineSliceDownload).toBeTypeOf('function')
    expect(main.useSliceUpload).toBeTypeOf('function')
    expect(main.useSliceDownload).toBeTypeOf('function')
  })

  it('exposes Vue hooks from the Vue source entry', async () => {
    const vue = await import('../src/vue')

    expect(vue.useSliceUpload).toBeTypeOf('function')
    expect(vue.useSliceDownload).toBeTypeOf('function')
  })

  it('exposes React hooks from the React source entry', async () => {
    const react = await import('../src/react')

    expect(react.useSliceUpload).toBeTypeOf('function')
    expect(react.useSliceDownload).toBeTypeOf('function')
  })
})
