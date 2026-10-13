/// <reference types="node" />
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type { Readable, Writable } from 'node:stream'
import type { BrowserCandidate } from './browser'

type Listener = (params: unknown, sessionId?: string) => void
interface Pending {
  resolve(v: unknown): void
  reject(e: Error): void
  timer: ReturnType<typeof setTimeout>
}

/** Chrome DevTools Protocol over `--remote-debugging-pipe`: NUL-delimited JSON. */
export class CdpPipe {
  private nextId = 1
  private buffer = ''
  private readonly decoder = new StringDecoder('utf8')
  private readonly pending = new Map<number, Pending>()
  private readonly listeners = new Map<string, Set<Listener>>()
  private closed = false

  private readonly output: Writable
  private readonly timeoutMs: number

  constructor(input: Readable, output: Writable, timeoutMs = 30_000) {
    this.output = output
    this.timeoutMs = timeoutMs
    input.on('data', (chunk: Buffer | string) => this.onData(typeof chunk === 'string' ? chunk : this.decoder.write(chunk)))
    input.on('close', () => this.failAll('Browser pipe closed'))
    input.on('error', (e) => this.failAll(`Browser pipe error: ${e.message}`))
    output.on('error', (e) => this.failAll(`Browser pipe error: ${e.message}`))
  }

  send<T = unknown>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    if (this.closed) return Promise.reject(new Error('CDP pipe is closed'))
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP ${method} timed out after ${this.timeoutMs}ms`))
      }, this.timeoutMs)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      this.output.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
    })
  }

  on(method: string, cb: Listener): () => void {
    let set = this.listeners.get(method)
    if (!set) this.listeners.set(method, (set = new Set()))
    set.add(cb)
    return () => set.delete(cb)
  }

  close(): void {
    this.failAll('CDP pipe is closed')
    this.output.end()
  }

  private onData(text: string): void {
    this.buffer += text
    let idx: number
    while ((idx = this.buffer.indexOf('\0')) !== -1) {
      const frame = this.buffer.slice(0, idx)
      this.buffer = this.buffer.slice(idx + 1)
      if (frame) this.dispatch(frame)
    }
  }

  private dispatch(frame: string): void {
    let msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: { code: number; message: string }; sessionId?: string }
    try {
      msg = JSON.parse(frame)
    } catch {
      return
    }
    if (typeof msg.id === 'number') {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      clearTimeout(p.timer)
      if (msg.error) p.reject(new Error(`CDP error ${msg.error.code}: ${msg.error.message}`))
      else p.resolve(msg.result)
    } else if (msg.method) {
      for (const cb of this.listeners.get(msg.method) ?? []) cb(msg.params, msg.sessionId)
    }
  }

  private failAll(reason: string): void {
    this.closed = true
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error(reason))
      this.pending.delete(id)
    }
  }
}

export interface LaunchedBrowser {
  cdp: CdpPipe
  close(): Promise<void>
}

const FLAGS = [
  '--headless=new',
  '--remote-debugging-pipe',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-gpu',
  '--hide-scrollbars',
  '--mute-audio',
]

export async function launchBrowser(candidate: BrowserCandidate, opts: { timeoutMs: number }): Promise<LaunchedBrowser> {
  const profile = await mkdtemp(join(tmpdir(), 'c4hero-browser-'))
  const removeProfile = () => rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  try {
    const proc = spawn(candidate.path, [...FLAGS, `--user-data-dir=${profile}`], {
      stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
    })
    await new Promise<void>((resolve, reject) => {
      proc.once('spawn', resolve)
      proc.once('error', reject)
    })
    proc.on('error', () => {})
    proc.stderr?.resume()
    const cdp = new CdpPipe(proc.stdio[4] as Readable, proc.stdio[3] as Writable, opts.timeoutMs)
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()))
    let closing: Promise<void> | undefined
    const close = () =>
      (closing ??= (async () => {
        try {
          cdp.close()
          if (proc.exitCode === null && proc.signalCode === null) {
            proc.kill('SIGKILL')
            await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))])
          }
        } finally {
          await removeProfile()
        }
      })())
    return { cdp, close }
  } catch (e) {
    await removeProfile()
    throw e
  }
}

export interface Page {
  sessionId: string
  evaluate<T>(expression: string, awaitPromise?: boolean): Promise<T>
}

/** Opens `url` in a new target, injecting `injectScript` before any page script runs. */
export async function openPage(cdp: CdpPipe, url: string, opts: { injectScript?: string; timeoutMs?: number } = {}): Promise<Page> {
  const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, sessionId)
  if (opts.injectScript) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: opts.injectScript }, sessionId)
  const loaded = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      off()
      reject(new Error('Page load timed out'))
    }, opts.timeoutMs ?? 30_000)
    const off = cdp.on('Page.loadEventFired', (_p, sid) => {
      if (sid !== sessionId) return
      clearTimeout(timer)
      off()
      resolve()
    })
  })
  loaded.catch(() => {})
  await cdp.send('Page.navigate', { url }, sessionId)
  await loaded
  return {
    sessionId,
    async evaluate<T>(expression: string, awaitPromise = false): Promise<T> {
      const res = await cdp.send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise },
        sessionId,
      )
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text)
      return res.result.value
    },
  }
}
