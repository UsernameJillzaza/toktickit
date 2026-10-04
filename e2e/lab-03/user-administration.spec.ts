import { test, expect } from '@playwright/test'
import { cleanupRun, createUser, disconnect, INITIAL_PASSWORD, READY_PASSWORD, runEmail, shot, signIn, signOut } from './support'
import type { E2EUser } from './support'

// Lab 3 E2E-06 … E2E-08 (AC-29 … AC-35), plus the user-management/
// screenshots. The admin here is a fresh, run-tagged Administrator.

let admin: E2EUser
let staff: E2EUser

test.beforeAll(async () => {
  admin = await createUser('ADMIN', 'Mali Admin', { ready: true })
  staff = await createUser('IT_STAFF', 'Krit Staff', { ready: true })
})

test.afterAll(async () => {
  await cleanupRun()
  await disconnect()
})

// E2E-06 (AC-29, AC-32)
test('E2E-06 an admin creates a user, who must change the password at first sign-in', async ({ page }) => {
  const email = runEmail('ui-created')
  await signIn(page, admin)
  await page.getByRole('navigation').getByRole('link', { name: 'User Management' }).click()
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
  await page.screenshot({ path: shot('user-management', 'list'), fullPage: true })

  await page.getByRole('button', { name: 'Create user' }).click()
  const form = page.getByRole('form', { name: 'Create user' })
  await form.getByRole('button', { name: 'Create user' }).click()
  await expect(form.getByText('Name must be 2–100 characters.')).toBeVisible()
  await page.screenshot({ path: shot('user-management', 'create-validation'), fullPage: true })

  await form.getByLabel(/^name/i).fill('Somsri New Hire')
  await form.getByLabel(/^email/i).fill(email)
  await form.getByLabel(/^role/i).selectOption('IT_STAFF')
  await form.getByLabel(/^initial password/i).fill(INITIAL_PASSWORD)
  await page.screenshot({ path: shot('user-management', 'create-filled'), fullPage: true })
  await form.getByRole('button', { name: 'Create user' }).click()
  await expect(page.getByText(/user created/i)).toBeVisible()

  await page.getByRole('searchbox', { name: 'Search name or email' }).fill(email)
  await page.getByRole('button', { name: /^search$/i }).click()
  const row = page.getByRole('row').filter({ hasText: 'Somsri New Hire' })
  await expect(row.getByText('Must change password')).toBeVisible()
  await expect(row.getByText('IT Staff')).toBeVisible()
  await page.screenshot({ path: shot('user-management', 'created-must-change'), fullPage: true })
  await signOut(page)

  await signIn(page, { email, password: INITIAL_PASSWORD })
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await page.getByLabel(/^current password/i).fill(INITIAL_PASSWORD)
  await page.getByLabel(/^new password/i).fill(READY_PASSWORD)
  await page.getByLabel(/^confirm new password/i).fill(READY_PASSWORD)
  await page.getByRole('button', { name: /save new password/i }).click()
  await expect(page).toHaveURL(/\/staff\/queue$/)
})

// E2E-07 (AC-31)
test('E2E-07 a deactivated user can no longer sign in', async ({ page }) => {
  const leaver = await createUser('REQUESTER', 'Leaving Colleague', { ready: true })
  await signIn(page, admin)
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'Edit Leaving Colleague' }).click()
  const form = page.getByRole('form', { name: 'Edit Leaving Colleague' })
  await form.getByLabel(/^active/i).uncheck()
  await page.screenshot({ path: shot('user-management', 'edit-deactivate'), fullPage: true })
  await form.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Changes saved.')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Leaving Colleague' }).getByText('Inactive')).toBeVisible()
  await signOut(page)

  await page.getByLabel(/^email/i).fill(leaver.email)
  await page.getByLabel(/^password/i).fill(leaver.password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('alert')).toContainText('inactive')
})

// E2E-08 (AC-33, AC-35)
test('E2E-08 an admin can’t switch off their own account; IT Staff can’t open User Management', async ({ page }) => {
  await signIn(page, admin)
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'Edit Mali Admin' }).click()
  const form = page.getByRole('form', { name: 'Edit Mali Admin' })
  await expect(form.getByLabel(/^role/i)).toBeDisabled()
  await expect(form.getByLabel(/^active/i)).toBeDisabled()
  await expect(form.getByText("You can't deactivate or change the role of your own account.")).toBeVisible()
  await expect(page.getByRole('region', { name: 'Set a new initial password' })).toBeVisible()
  await page.screenshot({ path: shot('user-management', 'edit-own-account'), fullPage: true })
  await signOut(page)

  await signIn(page, staff)
  await expect(page.getByRole('navigation').getByRole('link', { name: 'User Management' })).toHaveCount(0)
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
  await page.screenshot({ path: shot('user-management', 'forbidden-it-staff'), fullPage: true })
})
