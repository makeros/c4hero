import { describe, expect, it } from 'vitest'
import type { ServerMessage } from './protocol'
import { TerminalSession, type PtyLike, type TerminalClient } from './session'

class FakePty implements PtyLike {
  written: string[] = []
  sizes: Array<[number, number]> = []
  killed = false
  private dataCb: (d: string) => void = () => {}
  private exitCb: (e: { exitCode: number; signal?: number }) => void = () => {}
  onData(cb: (d: string) => void) {
    this.dataCb = cb
  }
  onExit(cb: (e: { exitCode: number; signal?: number }) => void) {
    this.exitCb = cb
  }
  write(d: string) {
    this.written.push(d)
  }
  resize(c: number, r: number) {
    this.sizes.push([c, r])
  }
  kill() {
    this.killed = true
  }
  emit(d: string) {
    this.dataCb(d)
  }
  exit(exitCode = 0, signal?: number) {
    this.exitCb({ exitCode, signal })
  }
}

function client(): TerminalClient & { msgs: ServerMessage[] } {
  const msgs: ServerMessage[] = []
  return { msgs, send: (m) => void msgs.push(m) }
}

function setup(opts?: { scrollbackBytes?: number }) {
  const ptys: FakePty[] = []
  const session = new TerminalSession(() => {
    const p = new FakePty()
    ptys.push(p)
    return p
  }, opts)
  return { session, ptys }
}

describe('TerminalSession', () => {
  it('spawns lazily on first attach and not again on a second', () => {
    const { session, ptys } = setup()
    expect(ptys).toHaveLength(0)
    session.attach(client())
    expect(ptys).toHaveLength(1)
    session.attach(client())
    expect(ptys).toHaveLength(1)
  })

  it('replays prior output to a late attacher, then streams live output', () => {
    const { session, ptys } = setup()
    const a = client()
    session.attach(a)
    expect(a.msgs[0]).toEqual({ type: 'replay', data: '' })
    ptys[0].emit('hello ')
    ptys[0].emit('world')
    const b = client()
    session.attach(b)
    expect(b.msgs).toEqual([{ type: 'replay', data: 'hello world' }])
    ptys[0].emit('!')
    expect(b.msgs[1]).toEqual({ type: 'output', data: '!' })
    expect(a.msgs.at(-1)).toEqual({ type: 'output', data: '!' })
  })

  it('trims the ring buffer to scrollbackBytes', () => {
    const { session, ptys } = setup({ scrollbackBytes: 5 })
    session.attach(client())
    ptys[0].emit('abc')
    ptys[0].emit('defgh')
    const late = client()
    session.attach(late)
    expect(late.msgs[0]).toEqual({ type: 'replay', data: 'defgh' })
  })

  it('drops the partial first line when trimming', () => {
    const { session, ptys } = setup({ scrollbackBytes: 8 })
    session.attach(client())
    ptys[0].emit('\x1b[31mab\ncd')
    const late = client()
    session.attach(late)
    expect(late.msgs[0]).toEqual({ type: 'replay', data: 'cd' })
  })

  it('attach after exit receives replay then exit', () => {
    const { session, ptys } = setup()
    session.attach(client())
    ptys[0].emit('bye')
    ptys[0].exit(2)
    const late = client()
    session.attach(late)
    expect(late.msgs).toEqual([
      { type: 'replay', data: 'bye' },
      { type: 'exit', exitCode: 2, signal: undefined },
    ])
  })

  it('restart broadcasts replay to all clients', () => {
    const { session, ptys } = setup()
    const a = client()
    const b = client()
    session.attach(a)
    session.attach(b)
    ptys[0].emit('x')
    ptys[0].exit()
    session.handle(a, { type: 'restart' })
    expect(a.msgs.at(-1)).toEqual({ type: 'replay', data: 'x' })
    expect(b.msgs.at(-1)).toEqual({ type: 'replay', data: 'x' })
    const late = client()
    session.attach(late)
    expect(late.msgs).toEqual([{ type: 'replay', data: 'x' }])
  })

  it('reports a spawn failure as an error and leaves the session able to start later', () => {
    let fail = true
    const ptys: FakePty[] = []
    const session = new TerminalSession(() => {
      if (fail) throw new Error('posix_spawnp failed')
      const p = new FakePty()
      ptys.push(p)
      return p
    })
    const c = client()
    expect(() => session.attach(c)).not.toThrow()
    expect(c.msgs.at(-1)).toEqual({ type: 'error', message: 'failed to start shell: posix_spawnp failed' })
    fail = false
    session.attach(client())
    expect(ptys).toHaveLength(1)
  })

  it('forwards input and resize to the PTY', () => {
    const { session, ptys } = setup()
    const c = client()
    session.attach(c)
    session.handle(c, { type: 'input', data: 'ls\r' })
    session.handle(c, { type: 'resize', cols: 100, rows: 30 })
    expect(ptys[0].written).toEqual(['ls\r'])
    expect(ptys[0].sizes).toEqual([[100, 30]])
  })

  it('broadcasts exit to all clients and keeps the buffer', () => {
    const { session, ptys } = setup()
    const a = client()
    const b = client()
    session.attach(a)
    session.attach(b)
    ptys[0].emit('bye')
    ptys[0].exit(3, 9)
    const exit = { type: 'exit', exitCode: 3, signal: 9 }
    expect(a.msgs.at(-1)).toEqual(exit)
    expect(b.msgs.at(-1)).toEqual(exit)
    const late = client()
    session.attach(late)
    expect(late.msgs[0]).toEqual({ type: 'replay', data: 'bye' })
    expect(ptys).toHaveLength(1)
  })

  it('restart after exit respawns with the last size; restart while alive does not', () => {
    const { session, ptys } = setup()
    const c = client()
    session.attach(c)
    session.handle(c, { type: 'resize', cols: 90, rows: 20 })
    session.handle(c, { type: 'restart' })
    expect(ptys).toHaveLength(1)
    ptys[0].exit()
    session.handle(c, { type: 'restart' })
    expect(ptys).toHaveLength(2)
    expect(ptys[1].sizes).toEqual([[90, 20]])
    ptys[1].emit('again')
    expect(c.msgs.at(-1)).toEqual({ type: 'output', data: 'again' })
  })

  it('kill kills the PTY', () => {
    const { session, ptys } = setup()
    const c = client()
    session.attach(c)
    session.handle(c, { type: 'kill' })
    expect(ptys[0].killed).toBe(true)
  })

  it('does not kill when the last client detaches', () => {
    const { session, ptys } = setup()
    const c = client()
    session.attach(c)
    session.detach(c)
    expect(ptys[0].killed).toBe(false)
    const again = client()
    session.attach(again)
    expect(ptys).toHaveLength(1)
  })

  it('dispose kills and ignores later messages', () => {
    const { session, ptys } = setup()
    const c = client()
    session.attach(c)
    session.dispose()
    expect(ptys[0].killed).toBe(true)
    session.handle(c, { type: 'input', data: 'x' })
    session.handle(c, { type: 'restart' })
    session.attach(client())
    expect(ptys[0].written).toEqual([])
    expect(ptys).toHaveLength(1)
  })
})
