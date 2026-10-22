import { test, expect } from '../fixtures/workspace'

test.describe('C4 cheat sheet link', () => {
  test('the top pill link has the expected href/target/rel and opens the cheat sheet in a new tab', async ({ workspace }) => {
    await workspace.loadSample()

    const link = workspace.page.getByRole('link', { name: 'C4 cheat sheet' })
    await expect(link).toHaveAttribute('href', '/cheat-sheet')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')

    const [popup] = await Promise.all([
      workspace.page.waitForEvent('popup'),
      link.click(),
    ])
    await popup.waitForLoadState()
    expect(popup.url()).toMatch(/\/cheat-sheet$/)
    await expect(popup.getByRole('main', { name: 'C4 cheat sheet' })).toBeVisible()
    await expect(popup.getByRole('heading', { name: 'Views' })).toBeVisible()
  })

  test('the link is visible when the workspace is read-only', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.evaluate(() => {
      const store = (window as unknown as { __testStore: () => { setReadOnly: (v: boolean) => void } }).__testStore()
      store.setReadOnly(true)
    })

    await expect(workspace.page.getByRole('link', { name: 'C4 cheat sheet' })).toBeVisible()
  })

  test('navigating directly to /cheat-sheet renders the page with no workspace loaded and no redirect', async ({ page }) => {
    await page.goto('/cheat-sheet')
    await expect(page.getByRole('main', { name: 'C4 cheat sheet' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Views' })).toBeVisible()
    await expect(page).toHaveURL(/\/cheat-sheet$/)
  })

  test('the page scrolls (its own scroll container, not the document body)', async ({ page }) => {
    await page.goto('/cheat-sheet')
    const scrollContainer = page.locator('.cheat-sheet-page')
    await expect(scrollContainer).toBeVisible()

    await scrollContainer.hover()
    const before = await scrollContainer.evaluate((el) => el.scrollTop)
    await page.mouse.wheel(0, 2000)
    await expect(async () => {
      const after = await scrollContainer.evaluate((el) => el.scrollTop)
      expect(after).toBeGreaterThan(before)
    }).toPass()
  })
})
