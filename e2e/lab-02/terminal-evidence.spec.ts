import { test } from '@playwright/test'

// Lab 2 §14 Part 3 submission evidence — screenshots the REAL `npm test`
// output (captured verbatim from an actual run, saved as a scratch HTML
// file styled like a terminal) since there's no tool available here to
// screenshot the native OS terminal directly. The text itself is genuine,
// unedited command output — only the presentation is rendered.

const OUT = 'artifacts/lab-02/manual-evidence'
const SCRATCH =
  'C:/Users/jillm/AppData/Local/Temp/claude/D--Claude-Projects-Uni3-1/15f8e9f0-d2db-44af-aa6c-a7a2276c8acc/scratchpad'

test.use({ baseURL: undefined })

test('server npm test — real output', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1000 })
  await page.goto(`file:///${SCRATCH}/terminal-server.html`)
  await page.screenshot({ path: `${OUT}/npm-test-server.png`, fullPage: true })
})

test('client npm test — real output', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1600 })
  await page.goto(`file:///${SCRATCH}/terminal-client.html`)
  await page.screenshot({ path: `${OUT}/npm-test-client.png`, fullPage: true })
})
