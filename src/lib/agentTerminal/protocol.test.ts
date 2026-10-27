import { describe, expect, it } from 'vitest'
import { encodeServerMessage, parseClientMessage } from './protocol'

describe('parseClientMessage', () => {
  it('accepts the four shapes', () => {
    expect(parseClientMessage('{"type":"input","data":"ls\\r"}')).toEqual({ type: 'input', data: 'ls\r' })
    expect(parseClientMessage('{"type":"input","data":""}')).toEqual({ type: 'input', data: '' })
    expect(parseClientMessage('{"type":"resize","cols":80,"rows":24}')).toEqual({ type: 'resize', cols: 80, rows: 24 })
    expect(parseClientMessage('{"type":"restart"}')).toEqual({ type: 'restart' })
    expect(parseClientMessage('{"type":"kill"}')).toEqual({ type: 'kill' })
  })

  it('rejects malformed JSON and non-objects', () => {
    for (const raw of ['', '{', 'nope', 'null', '42', '"input"', '[]']) {
      expect(parseClientMessage(raw)).toBeNull()
    }
  })

  it('rejects unknown or missing types', () => {
    expect(parseClientMessage('{"type":"exec"}')).toBeNull()
    expect(parseClientMessage('{}')).toBeNull()
    expect(parseClientMessage('{"type":1}')).toBeNull()
  })

  it('rejects non-string input data', () => {
    expect(parseClientMessage('{"type":"input","data":1}')).toBeNull()
    expect(parseClientMessage('{"type":"input"}')).toBeNull()
    expect(parseClientMessage('{"type":"input","data":null}')).toBeNull()
  })

  it('rejects non-integer cols/rows', () => {
    expect(parseClientMessage('{"type":"resize","cols":80.5,"rows":24}')).toBeNull()
    expect(parseClientMessage('{"type":"resize","cols":"80","rows":24}')).toBeNull()
    expect(parseClientMessage('{"type":"resize","cols":80}')).toBeNull()
    expect(parseClientMessage('{"type":"resize","cols":null,"rows":null}')).toBeNull()
  })

  it('clamps integer cols/rows into 1..1000', () => {
    expect(parseClientMessage('{"type":"resize","cols":0,"rows":-5}')).toEqual({ type: 'resize', cols: 1, rows: 1 })
    expect(parseClientMessage('{"type":"resize","cols":99999,"rows":1001}')).toEqual({
      type: 'resize',
      cols: 1000,
      rows: 1000,
    })
  })
})

describe('encodeServerMessage', () => {
  it('round-trips through JSON', () => {
    const msg = { type: 'exit', exitCode: 1, signal: 9 } as const
    expect(JSON.parse(encodeServerMessage(msg))).toEqual(msg)
  })
})
