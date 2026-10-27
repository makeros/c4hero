import { describe, expect, it } from 'vitest'
import { checkUpgrade, tokensEqual, type UpgradeRequestInfo } from './guards'

const TOKEN = 'a'.repeat(64)
const base: UpgradeRequestInfo = {
  remoteAddress: '127.0.0.1',
  host: 'localhost:3004',
  origin: 'http://localhost:3004',
  url: `/__agent-terminal?token=${TOKEN}`,
  port: 3004,
  token: TOKEN,
}
const withReq = (patch: Partial<UpgradeRequestInfo>): UpgradeRequestInfo => ({ ...base, ...patch })
const reasonOf = (req: UpgradeRequestInfo) => {
  const r = checkUpgrade(req)
  return r.ok ? null : r.reason
}

describe('checkUpgrade', () => {
  it('passes for every loopback and host combination with the right token', () => {
    for (const remoteAddress of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      for (const host of ['localhost:3004', '127.0.0.1:3004', '[::1]:3004']) {
        expect(checkUpgrade(withReq({ remoteAddress, host, origin: `http://${host}` }))).toEqual({ ok: true })
      }
    }
  })

  it('fails with a distinct reason per guard', () => {
    const reasons = [
      reasonOf(withReq({ remoteAddress: '192.168.1.5' })),
      reasonOf(withReq({ remoteAddress: undefined })),
      reasonOf(withReq({ host: 'evil.com' })),
      reasonOf(withReq({ host: 'localhost:3005' })),
      reasonOf(withReq({ origin: undefined })),
      reasonOf(withReq({ origin: 'http://evil.com' })),
      reasonOf(withReq({ origin: 'http://localhost:3005' })),
      reasonOf(withReq({ url: '/__agent-terminal' })),
      reasonOf(withReq({ url: `/__agent-terminal?token=${TOKEN.slice(0, 8)}` })),
      reasonOf(withReq({ url: `/__agent-terminal?token=${'b'.repeat(64)}` })),
      reasonOf(withReq({ url: `/other?token=${TOKEN}` })),
    ]
    for (const r of reasons) expect(r).toEqual(expect.any(String))
    // one reason per guard: loopback, host, missing origin, foreign origin, missing token, invalid token, path
    expect(new Set(reasons).size).toBe(7)
  })

  it('rejects a non-loopback remote', () => {
    expect(reasonOf(withReq({ remoteAddress: '10.0.0.2' }))).toMatch(/loopback/)
  })

  it('rejects a foreign host and the wrong port', () => {
    expect(reasonOf(withReq({ host: 'evil.com' }))).toMatch(/host/)
    expect(reasonOf(withReq({ host: 'localhost:3005' }))).toMatch(/host/)
  })

  it('rejects a missing or foreign origin', () => {
    expect(reasonOf(withReq({ origin: undefined }))).toBe('missing origin')
    expect(reasonOf(withReq({ origin: 'http://evil.com' }))).toBe('foreign origin')
    expect(reasonOf(withReq({ origin: 'http://localhost:3005' }))).toBe('foreign origin')
    expect(reasonOf(withReq({ origin: 'https://localhost:3004' }))).toBe('foreign origin')
  })

  it('rejects a missing, short or wrong token', () => {
    expect(reasonOf(withReq({ url: '/__agent-terminal' }))).toBe('missing token')
    expect(reasonOf(withReq({ url: '/__agent-terminal?token=' }))).toBe('missing token')
    expect(reasonOf(withReq({ url: '/__agent-terminal?token=abc' }))).toBe('invalid token')
    expect(reasonOf(withReq({ url: `/__agent-terminal?token=${'b'.repeat(64)}` }))).toBe('invalid token')
  })

  it('rejects a wrong path, even with a valid token', () => {
    expect(reasonOf(withReq({ url: `/other?token=${TOKEN}` }))).toBe('wrong path')
    expect(reasonOf(withReq({ url: `/__agent-terminal/x?token=${TOKEN}` }))).toBe('wrong path')
    expect(reasonOf(withReq({ url: undefined }))).toBe('wrong path')
  })
})

describe('tokensEqual', () => {
  it('compares equal and different strings', () => {
    expect(tokensEqual('abc', 'abc')).toBe(true)
    expect(tokensEqual('abc', 'abd')).toBe(false)
    expect(tokensEqual('', '')).toBe(true)
  })

  it('handles unequal lengths, including prefixes', () => {
    expect(tokensEqual('abc', 'abcd')).toBe(false)
    expect(tokensEqual('abcd', 'abc')).toBe(false)
    expect(tokensEqual('', 'a')).toBe(false)
    expect(tokensEqual('a', 'a\u0000')).toBe(false)
  })
})
