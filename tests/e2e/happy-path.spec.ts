import { test, expect } from '@playwright/test'

test('happy path: host + guest, vote, reveal, new round', async ({ browser }) => {
  const hostCtx = await browser.newContext()
  const guestCtx = await browser.newContext()
  const host = await hostCtx.newPage()
  const guest = await guestCtx.newPage()

  await host.goto('/')
  await host.getByRole('button', { name: /create room/i }).click()
  await expect(host).toHaveURL(/\/r\/[A-Z2-9]{6}/)
  const url = host.url()

  await host.getByPlaceholder(/e\.g\. alice/i).fill('Alice')
  await host.getByRole('button', { name: 'Join' }).click()
  await expect(host.getByText(/Alice/)).toBeVisible()

  await guest.goto(url)
  await guest.getByPlaceholder(/e\.g\. alice/i).fill('Bob')
  await guest.getByRole('button', { name: 'Join' }).click()

  await expect(host.getByText(/Bob/)).toBeVisible()
  await expect(guest.getByText(/Alice/)).toBeVisible()

  await host.getByRole('button', { name: '5', exact: true }).click()
  await guest.getByRole('button', { name: '8', exact: true }).click()

  await host.getByRole('button', { name: 'Reveal' }).click()

  await expect(host.getByText('6.5')).toBeVisible()
  await expect(guest.getByText('6.5')).toBeVisible()

  await host.getByRole('button', { name: 'New round' }).click()
  await expect(host.getByRole('button', { name: 'Reveal' })).toBeVisible()
  await expect(host.getByText(/History \(1\)/)).toBeVisible()
})
