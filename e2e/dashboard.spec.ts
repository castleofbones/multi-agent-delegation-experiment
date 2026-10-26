import { expect, test } from '@playwright/test'

const destinationUrl = process.env.E2E_DESTINATION_URL
if (!destinationUrl) throw new Error('E2E_DESTINATION_URL is required')

test('create, find, copy, follow and delete a short link', async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required')

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Link dashboard' })).toBeVisible()
  await expect(page.getByText('No links yet. Create one above to get started.')).toBeVisible()

  await page.getByLabel('Destination URL').fill(destinationUrl)
  await page.getByLabel(/Custom alias/).fill('Browser_E2E')
  await page.getByRole('button', { name: 'Create short link' }).click()
  await expect(page.getByRole('heading', { name: 'Browser_E2E' })).toBeVisible()
  await expect(page.getByText(destinationUrl, { exact: true })).toBeVisible()
  await expect(page.getByText('0 visits')).toBeVisible()

  const unrelatedAlias = 'Unrelated_E2E'
  const unrelatedDestination = `${new URL(destinationUrl).origin}/unrelated`
  await page.getByLabel('Destination URL').fill(unrelatedDestination)
  await page.getByLabel(/Custom alias/).fill(unrelatedAlias)
  await page.getByRole('button', { name: 'Create short link' }).click()
  await expect(page.getByRole('heading', { name: unrelatedAlias })).toBeVisible()
  await expect(page.getByText(unrelatedDestination, { exact: true })).toBeVisible()

  const targetHeading = page.getByRole('heading', { name: 'Browser_E2E' })
  const unrelatedHeading = page.getByRole('heading', { name: unrelatedAlias })
  const targetCard = page.getByRole('listitem').filter({ has: targetHeading })
  const search = page.getByRole('searchbox', { name: 'Search links' })
  await search.fill('Browser_E2E')
  await expect(targetHeading).toBeVisible()
  await expect(unrelatedHeading).toHaveCount(0)
  await search.fill('browser_e2e')
  await expect(targetHeading).toBeVisible()
  await expect(unrelatedHeading).toHaveCount(0)
  await search.fill('DESTINATION')
  await expect(targetHeading).toBeVisible()
  await expect(unrelatedHeading).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(search).toHaveValue('')
  await expect(targetHeading).toBeVisible()
  await expect(unrelatedHeading).toBeVisible()

  const updatedDestination = `${new URL(destinationUrl).origin}/unrelated`
  await targetCard.getByRole('button', { name: 'Edit destination' }).click()
  await targetCard.getByLabel('Destination URL for Browser_E2E').fill(updatedDestination)
  await targetCard.getByRole('button', { name: 'Save destination' }).click()
  await expect(targetCard.getByText(updatedDestination, { exact: true })).toBeVisible()

  let canReadClipboard = true
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL })
  } catch (error) {
    canReadClipboard = false
    const limitation = `Clipboard permissions unavailable: ${String(error)}`
    console.warn(limitation)
    test.info().annotations.push({ type: 'environment limitation', description: limitation })
  }
  await targetCard.getByRole('button', { name: 'Copy' }).click()
  if (canReadClipboard) {
    await expect(page.getByRole('status')).toContainText(`${baseURL}/Browser_E2E`)
    const copiedText = await page.evaluate(() => navigator.clipboard.readText()).catch((error: unknown) => {
      const limitation = `Clipboard read unavailable: ${String(error)}`
      console.warn(limitation)
      test.info().annotations.push({ type: 'environment limitation', description: limitation })
      return null
    })
    if (copiedText !== null) expect(copiedText).toBe(`${baseURL}/Browser_E2E`)
  }

  const destinationPage = await context.newPage()
  await destinationPage.goto(`/Browser_E2E`)
  await expect(destinationPage).toHaveURL(updatedDestination)
  await expect(destinationPage.getByRole('heading', { name: 'Deterministic E2E destination' })).toBeVisible()
  await destinationPage.close()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Browser_E2E' })).toBeVisible()
  await expect(page.getByText('1 visit')).toBeVisible()

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Browser_E2E')
    await dialog.accept()
  })
  await targetCard.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('status')).toContainText('Deleted short link')
  await expect(targetHeading).toHaveCount(0)
  await expect(unrelatedHeading).toBeVisible()
})
