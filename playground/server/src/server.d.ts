import type { Server } from 'node:http'

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

export function createPlaygroundServer(options?: PlaygroundServerOptions): PlaygroundServer

export function startPlaygroundServer(options?: PlaygroundServerOptions): Promise<PlaygroundServer>

export function clearPlaygroundStorage(storageDir?: string): Promise<void>
