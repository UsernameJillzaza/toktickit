import { test, expect } from '@playwright/test'
import { cleanupRun, createUser, disconnect, READY_PASSWORD, shot, signIn, signOut } from './support'
import type { E2EUser } from './support'

// Lab 3 E2E-01 … E2E-04, plus the authentication screenshots
// (artifacts/lab-03/screenshots/authentication/).

let requester: E2EUser
let staff: E2EUser
let admin: E2EUser
let inactive: E2EUser
let fresh: E2EUser

test.beforeAll(async () => {
  requester = await createUser('REQUESTER', 'Ploy Requester', { ready: true })
  staff = await createUser('IT_STAFF', 'Krit Staff', { ready: true })
  admin = await createUser('ADMIN', 'Mali Admin', { ready: true })
  inactive = await createUser('REQUESTER', 'Former Employee', { isActive: false })
  fresh = await createUser('REQUESTER', 'New Starter')
})

test.afterAll(async () => {
  await cleanupRun()
  await disconnect()
})

// E2E-01 (AC-01, AC-05, AC-06)
test('E2E-01 sign in: valid, wrong password, inactive account', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in to TokTickIT' })).toBeVisible()
  await page.screenshot({ path: shot('authentication', 'login-empty'), fullPage: true })

  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByText('Email is required.')).toBeVisible()
  await page.screenshot({ path: shot('authentication', 'login-validation'), fullPage: true })

  await page.getByLabel(/^email/i).fill(requester.email)
  await page.getByLabel(/^password/i).fill('Wrongpass123')
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password.')
  await expect(page.getByLabel(/^email/i)).toHaveValue(requester.email)
  await expect(page.getByLabel(/^password/i)).toHaveValue('')
  await page.screenshot({ path: shot('authentication', 'login-invalid'), fullPage: true })

  await page.getByLabel(/^email/i).fill(inactive.email)
  await page.getByLabel(/^password/i).fill(inactive.password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('alert')).toContainText('inactive')
  await page.screenshot({ path: shot('authentication', 'login-inactive'), fullPage: true })

  await signIn(page, requester)
  await expect(page).toHaveURL(/\/my-tickets$/)
  await expect(page.getByRole('navigation').getByText('Ploy Requester')).toBeVisible()
  await page.screenshot({ path: shot('authentication', 'requester-home'), fullPage: true })
})

// E2E-02 (AC-02)
test('E2E-02 an initial password must be changed before using the app', async ({ page }) => {
  await signIn(page, fresh)
  await expect(page).toHaveURL(/\/change-password$/)
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'My Tickets' })).toHaveCount(0)
  await page.screenshot({ path: shot('authentication', 'change-password-forced'), fullPage: true })

  // Typing a protected URL doesn't get around it.
  await page.goto('/my-tickets')
  await expect(page).toHaveURL(/\/change-password$/)

  await page.getByLabel(/^current password/i).fill(fresh.password)
  await page.getByLabel(/^new password/i).fill('short1')
  await page.getByLabel(/^confirm new password/i).fill('short1')
  await page.getByRole('button', { name: /save new password/i }).click()
  await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible()
  await page.screenshot({ path: shot('authentication', 'change-password-policy-error'), fullPage: true })

  await page.getByLabel(/^new password/i).fill(READY_PASSWORD)
  await page.getByLabel(/^confirm new password/i).fill(READY_PASSWORD)
  await page.getByRole('button', { name: /save new password/i }).click()
  await expect(page).toHaveURL(/\/my-tickets$/)
  await expect(page.getByText('Password updated')).toBeVisible()
  await page.screenshot({ path: shot('authentication', 'change-password-success'), fullPage: true })
})

// E2E-03 (AC-07, AC-09)
test('E2E-03 after logging out, protected pages send you to Login', async ({ page }) => {
  await signIn(page, requester)
  await signOut(page)
  await page.goto('/my-tickets')
  await expect(page.getByRole('heading', { name: 'Sign in to TokTickIT' })).toBeVisible()
  await page.goto('/staff/queue')
  await expect(page.getByRole('heading', { name: 'Sign in to TokTickIT' })).toBeVisible()
})

// E2E-04 (AC-10, FR-06)
test('E2E-04 each role sees its own menu; other pages are Forbidden', async ({ page }) => {
  const menu = () => page.getByRole('navigation').getByRole('link')

  await signIn(page, requester)
  await expect(page.getByRole('navigation').getByRole('link', { name: 'My Tickets' })).toBeVisible()
  await expect(menu().filter({ hasText: /Ticket Queue|User Management/ })).toHaveCount(0)
  await page.goto('/staff/queue')
  await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
  await page.screenshot({ path: shot('authentication', 'forbidden-requester-on-queue'), fullPage: true })
  await signOut(page)

  await signIn(page, staff)
  await expect(page).toHaveURL(/\/staff\/queue$/)
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Ticket Queue' })).toBeVisible()
  await expect(menu().filter({ hasText: /My Tickets|Create Ticket|User Management/ })).toHaveCount(0)
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
  await signOut(page)

  await signIn(page, admin)
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Ticket Queue' })).toBeVisible()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'User Management' })).toBeVisible()
  await page.screenshot({ path: shot('authentication', 'admin-menu'), fullPage: true })
})
