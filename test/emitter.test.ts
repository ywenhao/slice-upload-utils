import { describe, expect, it, vi } from 'vitest'
import { Emitter } from '../src/utils/emitter'

interface TestEvents {
  ping: (value: number) => void
  pong: () => void
  [key: string]: (...args: any[]) => void
}

describe('Emitter', () => {
  it('invokes every listener registered for an event', () => {
    const emitter = new Emitter<TestEvents>()
    const first = vi.fn<(value: number) => void>()
    const second = vi.fn<(value: number) => void>()

    emitter.on('ping', first).on('ping', second)
    emitter.emit('ping', 7)

    expect(first).toHaveBeenCalledWith(7)
    expect(second).toHaveBeenCalledWith(7)
  })

  it('removes a single listener while keeping the others', () => {
    const emitter = new Emitter<TestEvents>()
    const keep = vi.fn<(value: number) => void>()
    const drop = vi.fn<(value: number) => void>()

    emitter.on('ping', keep).on('ping', drop)
    emitter.off('ping', drop)
    emitter.emit('ping', 1)

    expect(keep).toHaveBeenCalledOnce()
    expect(drop).not.toHaveBeenCalled()
  })

  it('removes all listeners for an event when no callback is passed', () => {
    const emitter = new Emitter<TestEvents>()
    const listener = vi.fn<() => void>()

    emitter.on('pong', listener)
    emitter.off('pong')
    emitter.emit('pong')

    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps running listeners stable when one unsubscribes during emit', () => {
    const emitter = new Emitter<TestEvents>()
    const order: string[] = []
    const second = vi.fn<() => void>(() => order.push('second'))
    const first = vi.fn<() => void>(() => {
      order.push('first')
      emitter.off('pong', second)
    })

    emitter.on('pong', first).on('pong', second)
    emitter.emit('pong')

    // The current-round snapshot guarantees second still runs; removal takes effect next round.
    expect(order).toEqual(['first', 'second'])
    emitter.emit('pong')
    expect(second).toHaveBeenCalledOnce()
  })
})
