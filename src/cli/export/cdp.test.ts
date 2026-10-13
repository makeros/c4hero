/// <reference types="node" />
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { CdpPipe, openPage } from './cdp'

function setup(timeoutMs = 1000) {
  const fromBrowser = new PassThrough()
  const toBrowser = new PassThrough()
  const sent: Record<string, unknown>[] = []
  let raw = ''
  toBrowser.on('data', (c: Buffer) => {
    raw += c.toString()
    const parts = raw.split('\0')
    raw = parts.pop() ?? ''
    for (const p of parts) sent.push(JSON.parse(p))
  })
  const cdp = new CdpPipe(fromBrowser, toBrowser, timeoutMs)
  const reply = (obj: object) => fromBrowser.write(JSON.stringify(obj) + '\0')
  const tick = () => new Promise((r) => setTimeout(r, 5))
  return { cdp, fromBrowser, toBrowser, sent, reply, tick }
}

describe('CdpPipe', () => {
  it('frames requests with a trailing NUL and correlates ids', async () => {
    const { cdp, sent, reply, tick } = setup()
    const a = cdp.send('A.one', { x: 1 })
    const b = cdp.send('B.two', {}, 'sess')
    await tick()
    expect(sent).toEqual([
      { id: 1, method: 'A.one', params: { x: 1 } },
      { id: 2, method: 'B.two', params: {}, sessionId: 'sess' },
    ])
    reply({ id: 2, result: { v: 'b' } })
    reply({ id: 1, result: { v: 'a' } })
    expect(await a).toEqual({ v: 'a' })
    expect(await b).toEqual({ v: 'b' })
  })

  it('parses frames split across chunks and several frames per chunk', async () => {
    const { cdp, fromBrowser, tick } = setup()
    const a = cdp.send('A')
    const b = cdp.send('B')
    await tick()
    const f1 = JSON.stringify({ id: 1, result: { s: 'héllo' } })
    const bytes = Buffer.from(f1 + '\0' + JSON.stringify({ id: 2, result: 2 }) + '\0')
    const cut = bytes.indexOf(0xc3) + 1 // split inside a multibyte char
    fromBrowser.write(bytes.subarray(0, cut))
    fromBrowser.write(bytes.subarray(cut))
    expect(await a).toEqual({ s: 'héllo' })
    expect(await b).toBe(2)
  })

  it('rejects on error responses', async () => {
    const { cdp, reply, tick } = setup()
    const p = cdp.send('Bad')
    await tick()
    reply({ id: 1, error: { code: -32601, message: 'not found' } })
    await expect(p).rejects.toThrow('-32601: not found')
  })

  it('rejects on per-call timeout', async () => {
    const { cdp } = setup(20)
    await expect(cdp.send('Slow')).rejects.toThrow('timed out')
  })

  it('rejects pending calls when the browser pipe closes', async () => {
    const { cdp, fromBrowser } = setup()
    const p = cdp.send('A')
    fromBrowser.end()
    await expect(p).rejects.toThrow('closed')
    await expect(cdp.send('B')).rejects.toThrow('closed')
  })

  it('delivers events to subscribers until unsubscribed', async () => {
    const { cdp, reply, tick } = setup()
    const cb = vi.fn()
    const off = cdp.on('Page.loadEventFired', cb)
    reply({ method: 'Page.loadEventFired', params: { t: 1 }, sessionId: 's' })
    await tick()
    off()
    reply({ method: 'Page.loadEventFired', params: { t: 2 } })
    await tick()
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ t: 1 }, 's')
  })
})

describe('openPage', () => {
  it('drives the target lifecycle and evaluates by value', async () => {
    const { cdp, sent, reply, tick } = setup()
    const results: Record<string, object> = {
      'Target.createTarget': { targetId: 'T' },
      'Target.attachToTarget': { sessionId: 'S' },
      'Runtime.evaluate': { result: { value: 42 } },
    }
    // auto-respond to each request as it arrives
    const seen = new Set<number>()
    const pump = setInterval(() => {
      for (const m of sent) {
        const id = m.id as number
        if (seen.has(id)) continue
        seen.add(id)
        reply({ id, result: results[m.method as string] ?? {} })
        if (m.method === 'Page.navigate') reply({ method: 'Page.loadEventFired', params: {}, sessionId: 'S' })
      }
    }, 2)
    const page = await openPage(cdp, 'data:text/html,hi', { injectScript: 'window.x=1' })
    expect(await page.evaluate<number>('1+41', true)).toBe(42)
    clearInterval(pump)
    await tick()
    expect(sent.map((m) => m.method)).toEqual([
      'Target.createTarget',
      'Target.attachToTarget',
      'Page.enable',
      'Page.addScriptToEvaluateOnNewDocument',
      'Page.navigate',
      'Runtime.evaluate',
    ])
    expect(sent[1].params).toEqual({ targetId: 'T', flatten: true })
    expect(sent[5]).toMatchObject({ sessionId: 'S', params: { expression: '1+41', returnByValue: true, awaitPromise: true } })
  })
})
