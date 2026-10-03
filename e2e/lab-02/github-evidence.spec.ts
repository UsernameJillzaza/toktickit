import { test, expect } from '@playwright/test'

// Lab 2 §14 Part 1/2 submission evidence — screenshots of public GitHub
// pages (network graph, project board, PR #20 merge timestamp). These are
// plain page.goto()+screenshot against real github.com, unauthenticated,
// since the repo and project board are Public.
// Run with: npx playwright test e2e/lab-02/github-evidence.spec.ts

const OUT = 'artifacts/lab-02/manual-evidence'
const REPO = 'https://github.com/UsernameJillzaza/toktickit'

test.use({ baseURL: undefined })

test('GitHub network graph', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto(`${REPO}/network`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/github-network-graph.png`, fullPage: true })
})

test('GitHub project board', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('https://github.com/users/UsernameJillzaza/projects/3')
  await page.waitForTimeout(2000)
  // The board scrolls horizontally inside its own container — a fullPage
  // screenshot only captures vertical overflow, so the "itsDone" column
  // (rightmost) needs the container scrolled all the way right first.
  await page.mouse.move(700, 400)
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(2000, 0)
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/github-project-board.png` })
})

test('PR #20 (spec) merged before PR #21 (first implementation)', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto(`${REPO}/pull/20`)
  await expect(page.getByText(/merged/i).first()).toBeVisible()
  await page.screenshot({ path: `${OUT}/github-pr20-merged-timestamp.png`, fullPage: true })

  await page.goto(`${REPO}/pull/21`)
  await expect(page.getByText(/merged/i).first()).toBeVisible()
  await page.screenshot({ path: `${OUT}/github-pr21-merged-timestamp.png`, fullPage: true })
})

test('reviewer.md, README.md, .gitignore rendered', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto(`${REPO}/blob/main/docs/lab-02/reviewer.md`)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/github-reviewer-md.png`, fullPage: true })

  await page.goto(`${REPO}/blob/main/README.md`)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/github-readme.png`, fullPage: true })

  await page.goto(`${REPO}/blob/main/.gitignore`)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/github-gitignore.png`, fullPage: true })
})
