import { test, expect } from '../fixtures/workspace'

// Two views that both explicitly include "API Application" (and the customer
// who visits it), a relation between them with documents, and a software
// system with documents that sits in neither view — covers A–Z ordering,
// multi-view navigation (for the chip/Back journey) and the "Not in any
// view" row in one small workspace.
const DOCS_DSL = `workspace "Docs Sidebar Test" "Fixture for the documents sidebar E2E spec" {
  model {
    customer = person "Customer" "Visits the bank's systems"

    api = softwareSystem "API Application" "Serves the public API" {
      properties {
        "c4hero.documents.0.path" "architecture/api-overview.md"
        "c4hero.documents.0.title" "Service overview"
      }
    }

    orphan = softwareSystem "Aardvark System" "Has documents but is in no view" {
      properties {
        "c4hero.documents.0.path" "architecture/orphan.md"
        "c4hero.documents.0.title" "Orphan doc"
      }
    }

    customer -> api "Visits bigbank.com" "HTTPS" {
      properties {
        "c4hero.documents.0.path" "runbooks/login-flow.md"
        "c4hero.documents.0.title" "Login flow"
      }
    }
  }

  views {
    systemLandscape "Landscape" "System Landscape" {
      include customer api
      autoLayout lr
    }
    systemContext api "ApiContext" "API Context" {
      include customer api
      autoLayout lr
    }
  }
}`

// The two documented entries' sidebar rows, in the A–Z order buildDocumentIndex
// produces: "Aardvark System" < "API Application" < "Customer → API Application".
const AARDVARK = 'Aardvark System'
const API_APP = 'API Application'
const RELATION = 'Customer → API Application'

function sidebar(workspace: { page: import('@playwright/test').Page }) {
  return workspace.page.locator('[data-canvas-chrome="documents-sidebar"]')
}

function topPillDocumentsButton(workspace: { page: import('@playwright/test').Page }) {
  // Not a role+exact-name lookup: the button's aria-label folds in the
  // documented-item count (e.g. "Documents (3)"), so its accessible name
  // isn't the fixed string "Documents".
  return workspace.page.locator('[data-documents-toggle]')
}

async function openSidebar(workspace: { page: import('@playwright/test').Page }) {
  await topPillDocumentsButton(workspace).click()
  await expect(sidebar(workspace)).toBeVisible()
}

// On a real reload with no folder handle and nothing autosaved, useRefreshRedirect
// fails to recover a workspace and redirects to "/" — confirmed by direct
// polling (see Task 3.1's write-up) to race against re-injecting a workspace
// through __testParseAndLoad the instant that redirect lands: the very first
// re-injection reliably gets stomped back to "/" a few hundred ms later, and a
// second attempt afterward reliably sticks. Retrying is a deliberate, bounded
// response to that one specific, characterized race in the app's own
// redirect-on-reload path — not a blind timeout — and it only governs how the
// test re-establishes a workspace after a reload; it asserts nothing about the
// documentsSidebarOpen/Width persistence this test exists to verify.
async function reinjectWorkspaceAfterReload(page: import('@playwright/test').Page, dsl: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate((d) => (window as Record<string, unknown>).__testParseAndLoad?.(d), dsl)
    try {
      await page.waitForURL(/\/collection\//, { timeout: 2000 })
      await page.waitForTimeout(500) // let the race (if any) resolve before trusting it
      if (page.url().includes('/collection/')) return
    } catch {
      // fall through to retry
    }
  }
  throw new Error('workspace never stuck after reload despite retries')
}

// Only the persistent parts of the store are read here. `focusElementId` /
// `focusRelationshipId` are a transient "center on this" signal that
// Canvas.tsx's effect consumes and clears a moment after the view/selection
// settle (see Canvas.tsx's focusElementId/focusRelationshipId effects) — by
// the time an E2E assertion's own round trip reaches the store, that flag
// may already be back to null. That centering behavior is covered precisely,
// without the race, by navigation-reveal.test.ts; here we assert the
// persistent, user-visible outcomes instead: the active view, the selection,
// and the inspector.
async function getStoreState(workspace: { page: import('@playwright/test').Page }) {
  return workspace.page.evaluate(() => {
    const store = (window as unknown as { __testStore?: () => Record<string, unknown> }).__testStore?.()
    return {
      activeViewKey: store?.activeViewKey as string | null,
      selectedElementIds: store?.selectedElementIds as string[],
      selectedRelationshipId: store?.selectedRelationshipId as string | null,
    }
  })
}

test.describe('Documents Sidebar', () => {
  test('is closed by default and opens/closes from the top-pill button', async ({ workspace }) => {
    await workspace.parseAndLoad(DOCS_DSL)

    await expect(sidebar(workspace)).toHaveCount(0)

    const button = topPillDocumentsButton(workspace)
    await button.click()
    await expect(sidebar(workspace)).toBeVisible()
    await expect(button).toHaveAttribute('data-active', 'true')

    await button.click()
    await expect(sidebar(workspace)).toHaveCount(0)
    await expect(button).not.toHaveAttribute('data-active', 'true')
  })

  test('toggles with the "d" keyboard shortcut', async ({ workspace }) => {
    await workspace.parseAndLoad(DOCS_DSL)
    await workspace.clickCanvas()

    await expect(sidebar(workspace)).toHaveCount(0)

    await workspace.page.keyboard.press('d')
    await expect(sidebar(workspace)).toBeVisible()

    await workspace.page.keyboard.press('d')
    await expect(sidebar(workspace)).toHaveCount(0)
  })

  test('lists documented elements and relations A-Z with a "Not in any view" row for the unused one', async ({ workspace }) => {
    await workspace.parseAndLoad(DOCS_DSL)
    await openSidebar(workspace)

    const text = (await sidebar(workspace).innerText())
    expect(text.indexOf(AARDVARK)).toBeGreaterThanOrEqual(0)
    expect(text.indexOf(API_APP)).toBeGreaterThan(text.indexOf(AARDVARK))
    expect(text.indexOf(RELATION)).toBeGreaterThan(text.indexOf(API_APP))

    // Aardvark System is in no view: no view chip for it, and the sidebar
    // shows its "Not in any view" row (the only entry here with none).
    await expect(workspace.page.getByRole('button', { name: new RegExp(`^Open ${AARDVARK} in `) })).toHaveCount(0)
    await expect(sidebar(workspace).getByText('Not in any view')).toBeVisible()
  })

  test('a document link opens the rendered document in a new tab', async ({ workspace }) => {
    await workspace.parseAndLoad(DOCS_DSL)
    await openSidebar(workspace)

    const link = workspace.page.getByRole('link', { name: 'Service overview' })
    await expect(link).toHaveAttribute(
      'href',
      '/document-view?path=architecture%2Fapi-overview.md&title=Service+overview',
    )
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('a view chip switches the view, centers and selects the item, opens the inspector, and Back returns', async ({ workspace }) => {
    await workspace.parseAndLoad(DOCS_DSL)
    await openSidebar(workspace)

    expect((await getStoreState(workspace)).activeViewKey).toBe('Landscape')
    await expect(workspace.page).toHaveURL(/\/Landscape$/)

    await workspace.page.getByRole('button', { name: `Open ${API_APP} in API Context` }).click()

    await expect(workspace.page).toHaveURL(/\/ApiContext$/)
    await expect(workspace.page.getByLabel('Element properties')).toBeVisible()
    await expect(workspace.page.getByLabel('Element properties')).toContainText(API_APP)

    const afterClick = await getStoreState(workspace)
    expect(afterClick.activeViewKey).toBe('ApiContext')
    expect(afterClick.selectedElementIds).toEqual(['api'])

    // React's StrictMode (wrapping the whole app in main.tsx, active whenever
    // the app runs un-built — i.e. under `npm run dev`, which is what this
    // suite's webServer always starts) double-invokes effects, so useRouteSync's
    // url-sync effect pushes a history entry twice per activeViewKey change.
    // Confirmed this isn't a documents-sidebar regression: the plain
    // ViewSwitcher / __testSetView path double-pushes identically. It doesn't
    // reproduce in a production build (StrictMode's double-invoke is a dev-only
    // no-op there), so one browser Back press is what an end user actually
    // needs — but two are needed to unwind it against this dev server.
    await workspace.page.goBack()
    await workspace.page.goBack()
    await expect(workspace.page).toHaveURL(/\/Landscape$/)
    expect((await getStoreState(workspace)).activeViewKey).toBe('Landscape')
  })

  test('a relation chip selects the relation and opens the inspector', async ({ workspace }) => {
    await workspace.parseAndLoad(DOCS_DSL)
    await openSidebar(workspace)

    const relationship = await workspace.getRelationshipByDescription('Visits bigbank.com')
    expect(relationship).toBeTruthy()

    await workspace.page.getByRole('button', { name: `Open ${RELATION} in API Context` }).click()

    await expect(workspace.page).toHaveURL(/\/ApiContext$/)
    await expect(workspace.page.getByLabel('Element properties')).toBeVisible()

    const state = await getStoreState(workspace)
    expect(state.selectedRelationshipId).toBe(relationship!.id)
  })

  test('open state and width persist across a reload', async ({ workspace }) => {
    const page = workspace.page

    // Deliberately not workspace.parseAndLoad()/goto() here: those register a
    // page.addInitScript() that clears localStorage — and it does so on
    // *every* subsequent navigation for this page's lifetime, including the
    // page.reload() below, which would wipe the very setting this test is
    // verifying. Do the same first-time setup with a one-shot page.evaluate()
    // instead, which (unlike addInitScript) does not re-run on reload.
    await page.goto('/')
    await page.evaluate(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
      window.localStorage.setItem('c4hero.json', JSON.stringify({ canvasGuideDismissed: true }))
    })
    await reinjectWorkspaceAfterReload(page, DOCS_DSL)
    await page.locator('.react-flow').waitFor({ state: 'visible' })

    await openSidebar(workspace)

    const handle = page.getByLabel('Resize documents sidebar')
    await handle.press('ArrowLeft')
    await handle.press('ArrowLeft')
    const widenedWidth = await handle.getAttribute('aria-valuenow')
    expect(widenedWidth).toBe('372') // default 340 + 2 * 16px key step

    // The in-memory workspace loaded via __testParseAndLoad doesn't survive a
    // real reload either (no folder handle / autosave to restore it from) —
    // on reload, useRefreshRedirect fails to recover it and navigates to "/".
    // Wait for that redirect to land, then re-inject (see
    // reinjectWorkspaceAfterReload's comment for why that needs a retry).
    await page.reload()
    await page.waitForURL((url) => url.pathname === '/', { timeout: 15000 })
    await reinjectWorkspaceAfterReload(page, DOCS_DSL)
    await page.locator('.react-flow').waitFor({ state: 'visible' })

    await expect(sidebar(workspace)).toBeVisible()
    await expect(page.getByLabel('Resize documents sidebar')).toHaveAttribute('aria-valuenow', '372')
  })

  test('the inspector is not overlapped by the sidebar', async ({ workspace }) => {
    await workspace.parseAndLoad(DOCS_DSL)
    await openSidebar(workspace)

    await workspace.page.getByRole('button', { name: `Open ${API_APP} in API Context` }).click()
    await expect(workspace.page.getByLabel('Element properties')).toBeVisible()

    const inspectorBox = await workspace.page.getByLabel('Element properties').boundingBox()
    const sidebarBox = await sidebar(workspace).boundingBox()
    expect(inspectorBox).toBeTruthy()
    expect(sidebarBox).toBeTruthy()
    expect(inspectorBox!.x + inspectorBox!.width).toBeLessThanOrEqual(sidebarBox!.x + 1)
  })
})
