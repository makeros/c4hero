import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const BASIC_DSL = `
workspace {
  model {
    user = person "User"
  }
  views {
    systemLandscape "Landscape" {
      include *
    }
  }
}
`

describe('getLockedWorkspace', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('virtual:locked-workspace')
  })

  it('returns null when the virtual module is null', async () => {
    vi.doMock('virtual:locked-workspace', () => ({ default: null }))

    const { getLockedWorkspace } = await import('./lockedWorkspace')

    expect(getLockedWorkspace()).toBeNull()
  })

  it('returns a parsed Workspace when the virtual module is populated, applying sidecar fields', async () => {
    vi.doMock('virtual:locked-workspace', () => ({
      default: {
        dsl: BASIC_DSL,
        sidecar: JSON.stringify({
          version: 1,
          elements: {
            user: { status: 'Deprecated', owner: 'Platform Team' },
          },
        }),
        name: 'baked-workspace',
      },
    }))

    const { getLockedWorkspace } = await import('./lockedWorkspace')
    const workspace = getLockedWorkspace()

    expect(workspace).not.toBeNull()
    expect(workspace?.name).toBe('baked-workspace')
    expect(workspace?.model.people[0]).toMatchObject({
      id: 'user',
      status: 'Deprecated',
      owner: 'Platform Team',
    })
  })

  it('computes the workspace once at module load, not on every call', async () => {
    vi.doMock('virtual:locked-workspace', () => ({
      default: { dsl: BASIC_DSL, sidecar: null, name: 'baked-workspace' },
    }))

    const { getLockedWorkspace } = await import('./lockedWorkspace')

    expect(getLockedWorkspace()).toBe(getLockedWorkspace())
  })

  it('does not throw when the fixture DSL produces parse warnings', async () => {
    // Unknown relationship endpoint ("missing") triggers a parse error/warning
    // from parseDSL, exercised here via the same parseWorkspaceDocument path.
    const DSL_WITH_WARNING = `
workspace {
  model {
    user = person "User"
    user -> missing "Uses"
  }
  views {
    systemLandscape "Landscape" {
      include *
    }
  }
}
`
    vi.doMock('virtual:locked-workspace', () => ({
      default: { dsl: DSL_WITH_WARNING, sidecar: null, name: 'baked-workspace' },
    }))

    const { getLockedWorkspace } = await import('./lockedWorkspace')

    expect(() => getLockedWorkspace()).not.toThrow()
  })
})
