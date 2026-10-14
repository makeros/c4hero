import { test, expect } from '../fixtures/workspace'

test.describe('Toolbar', () => {
  test('tool rail renders the primary canvas actions', async ({ workspace }) => {
    await workspace.loadBlank()
    await expect(workspace.page.getByRole('button', { name: 'Add element' })).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: 'Auto-arrange' })).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: /Multi-select/ })).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: 'Zoom to fit' })).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: 'Canvas settings' })).toBeVisible()
  })

  test('auto-arrange menu exposes layout directions', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByRole('button', { name: 'Auto-arrange' }).click()
    await expect(workspace.page.getByRole('menu')).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: 'Top to bottom' })).toBeVisible()
    await expect(workspace.page.getByRole('button', { name: 'Left to right' })).toBeVisible()
    await workspace.page.getByRole('button', { name: 'Left to right' }).click()
  })

  test('auto-arrange centers differently sized rendered nodes', async ({ workspace }) => {
    await workspace.parseAndLoad(`workspace "Auto Arrange Centering" {
  model {
    customer = person "Personal Banking Customer" "A customer of the bank, with personal bank accounts."
    atm = softwareSystem "ATM" "Allows customers to withdraw cash."
    mainframe = softwareSystem "Mainframe Banking System" "Stores all of the core banking information about customers, accounts, transactions, payments, statements, balances, limits, audit trails and every other record of the bank, and is the single system of record for all of them."

    customer -> atm "Withdraws cash using"
    atm -> mainframe "Uses"
  }
  views {
    systemLandscape landscape "Landscape" {
      include *
      autolayout lr
    }
  }
}`)

    await expect.poll(() => renderedSizeSpread(workspace.page, ['customer', 'atm', 'mainframe'], 'height')).toBeGreaterThan(20)

    await workspace.page.getByRole('button', { name: 'Auto-arrange' }).click()
    await workspace.page.getByRole('button', { name: 'Left to right' }).click()

    await expect.poll(() => renderedCenterSpread(workspace.page, ['customer', 'atm', 'mainframe'], 'y')).toBeLessThan(2)

    await workspace.page.getByRole('button', { name: 'Auto-arrange' }).click()
    await workspace.page.getByRole('button', { name: 'Top to bottom' }).click()

    await expect.poll(() => renderedCenterSpread(workspace.page, ['customer', 'atm', 'mainframe'], 'x')).toBeLessThan(2)

    await workspace.page.getByRole('button', { name: 'Auto-arrange' }).click()
    await workspace.page.getByRole('button', { name: 'Left to right' }).click()

    await expect.poll(() => renderedCenterSpread(workspace.page, ['customer', 'atm', 'mainframe'], 'y')).toBeLessThan(2)
  })

  test('canvas settings expose snap to grid and minimap controls', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByRole('button', { name: 'Canvas settings' }).click()
    await expect(workspace.page.getByText('Snap to grid', { exact: true })).toBeVisible()
    await expect(workspace.page.getByText('Minimap', { exact: true })).toBeVisible()
    await workspace.page.getByLabel('Close dialog').click()
  })

  test('zoom controls are functional', async ({ workspace }) => {
    await workspace.loadSample()
    await workspace.page.getByRole('button', { name: 'Canvas settings' }).click()
    await workspace.page.getByRole('switch').nth(1).click()
    await workspace.page.getByLabel('Close dialog').click()

    const zoomIn = workspace.page.getByRole('button', { name: 'Zoom in', exact: true })
    const zoomOut = workspace.page.getByRole('button', { name: 'Zoom out', exact: true })
    const fitScreen = workspace.page.getByRole('button', { name: 'Fit to screen', exact: true })
    await expect(zoomIn).toBeVisible()
    await expect(zoomOut).toBeVisible()
    await expect(fitScreen).toBeVisible()
    await zoomIn.click()
    await zoomOut.click()
    await fitScreen.click()
  })
})

async function renderedCenterSpread(
  page: import('@playwright/test').Page,
  ids: string[],
  axis: 'x' | 'y',
) {
  const centers: number[] = []
  for (const id of ids) {
    const box = await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox()
    if (!box) throw new Error(`Node ${id} has no rendered bounding box`)
    centers.push(axis === 'x' ? box.x + box.width / 2 : box.y + box.height / 2)
  }
  return Math.max(...centers) - Math.min(...centers)
}

async function renderedSizeSpread(
  page: import('@playwright/test').Page,
  ids: string[],
  dimension: 'width' | 'height',
) {
  const sizes: number[] = []
  for (const id of ids) {
    const box = await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox()
    if (!box) throw new Error(`Node ${id} has no rendered bounding box`)
    sizes.push(box[dimension])
  }
  return Math.max(...sizes) - Math.min(...sizes)
}
