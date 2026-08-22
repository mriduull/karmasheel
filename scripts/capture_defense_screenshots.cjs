#!/usr/bin/env node

/**
 * Capture report-ready screenshots from the seeded local demo.
 *
 * Prerequisites (from the repository root):
 *   .\venv\Scripts\python.exe backend\manage.py migrate --settings=config.local_sqlite_settings
 *   .\venv\Scripts\python.exe backend\manage.py seed_demo --settings=config.local_sqlite_settings
 *   # terminal 1
 *   cd backend; ..\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000 --settings=config.local_sqlite_settings
 *   # terminal 2
 *   cd frontend; npm run dev -- --host 127.0.0.1
 *   # terminal 3, from repository root
 *   node scripts/capture_defense_screenshots.cjs
 *
 * The script prefers a project-local Playwright package. If none is present,
 * it installs Playwright in the OS temporary directory (not package.json or
 * package-lock.json) and uses the system Chrome/Edge binary. Browser contexts
 * are isolated, extension-free, and contain only freshly issued demo tokens.
 */

'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const repoRoot = path.resolve(__dirname, '..')
const outputDir = path.join(repoRoot, 'docs', 'appendix-c', 'screenshots')
const frontendOrigin = process.env.CAPTURE_FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
const backendOrigin = process.env.CAPTURE_BACKEND_ORIGIN || 'http://127.0.0.1:8000'
const demoPassword = process.env.CAPTURE_DEMO_PASSWORD || 'DemoPass123!'
const playwrightVersion = '1.62.1'
const temporaryRunner = path.join(os.tmpdir(), 'karmasheel-playwright-runner')

const desktopViewport = { width: 1440, height: 900 }
const mobileViewport = { width: 390, height: 844 }

const outputFiles = {
  landing: 'c01-public-landing.png',
  jobs: 'c02-public-job-discovery.png',
  workerProfile: 'c03-worker-profile-skills.png',
  workerRecommendations: 'c04-worker-job-recommendations.png',
  opportunityNearMiss: 'c05a-opportunity-near-miss.png',
  opportunitySkills: 'c05b-opportunity-skill-gap.png',
  workerApplications: 'c06-worker-applications-ratings.png',
  workerCv: 'c07-generated-worker-cv.png',
  employerJobs: 'c08-employer-job-management.png',
  employerApplications: 'c09-employer-application-lifecycle.png',
  employerRecommendations: 'c10-employer-worker-recommendations.png',
  pendingEmployer: 'c11-pending-employer-boundary.png',
  adminEmployers: 'c12a-admin-employer-moderation.png',
  adminTaxonomy: 'c12b-admin-taxonomy-moderation.png',
  mobileJobs: 'c13-mobile-job-discovery.png',
}

function loadPlaywright() {
  const candidates = [
    path.join(repoRoot, 'frontend', 'node_modules', 'playwright'),
    path.join(temporaryRunner, 'node_modules', 'playwright'),
  ]

  for (const candidate of candidates) {
    try {
      return require(candidate)
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error
    }
  }

  fs.mkdirSync(temporaryRunner, { recursive: true })
  const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  console.log(`Playwright is not installed; preparing isolated ${temporaryRunner}`)
  execFileSync(
    npmExecutable,
    [
      'install',
      '--prefix',
      temporaryRunner,
      '--no-package-lock',
      '--ignore-scripts',
      `playwright@${playwrightVersion}`,
    ],
    { stdio: 'inherit' },
  )
  return require(path.join(temporaryRunner, 'node_modules', 'playwright'))
}

function findBrowserExecutable() {
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/microsoft-edge',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
          ]

  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${options.method || 'GET'} ${url} returned ${response.status}: ${body.slice(0, 500)}`)
  }
  return response.json()
}

async function assertServicesReady() {
  for (const endpoint of [
    `${backendOrigin}/api/health/`,
    `${backendOrigin}/api/readiness/`,
    `${frontendOrigin}/`,
  ]) {
    const response = await fetch(endpoint)
    if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}`)
  }
}

async function demoStorageState(username) {
  const tokens = await requestJson(`${backendOrigin}/api/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: demoPassword }),
  })

  if (!tokens.refresh) throw new Error(`Login for ${username} returned no refresh token`)
  return {
    cookies: [],
    origins: [
      {
        origin: frontendOrigin,
        localStorage: [{ name: 'workforce-match.refreshToken', value: tokens.refresh }],
      },
    ],
  }
}

function contextOptions(viewport, storageState) {
  return {
    viewport,
    screen: viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'Asia/Kathmandu',
    reducedMotion: 'reduce',
    storageState,
  }
}

async function newPage(browser, { viewport = desktopViewport, username } = {}) {
  const storageState = username ? await demoStorageState(username) : undefined
  const context = await browser.newContext(contextOptions(viewport, storageState))
  const page = await context.newPage()

  page.on('pageerror', (error) => {
    console.error(`Browser page error: ${error.message}`)
  })
  return { context, page }
}

async function settle(page, expectedText) {
  if (expectedText) {
    await page.waitForFunction(
      (text) => document.body.innerText.includes(text),
      expectedText,
      { timeout: 20_000 },
    )
  }
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready
  })
  await page.waitForTimeout(250)
}

async function goto(page, route, expectedText) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await page.goto(`${frontendOrigin}${route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      })
      if (!response?.ok()) throw new Error(`${route} returned HTTP ${response?.status()}`)
      await settle(page, expectedText)
      return
    } catch (error) {
      lastError = error
      if (attempt < 3) await page.waitForTimeout(750)
    }
  }
  throw lastError
}

async function assertSafeVisibleContent(page, filename) {
  const text = await page.locator('body').innerText()
  const forbidden = [
    demoPassword,
    'Authorization: Bearer',
    'workforce-match.refreshToken',
    /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/,
  ]
  for (const value of forbidden) {
    const found = value instanceof RegExp ? value.test(text) : text.includes(value)
    if (found) throw new Error(`Refusing to capture ${filename}: visible secret-like content detected`)
  }

  const passwordFields = await page.locator('input[type="password"]:visible').count()
  if (passwordFields > 0) {
    throw new Error(`Refusing to capture ${filename}: a password field is visible`)
  }
}

async function screenshot(page, filename) {
  await assertSafeVisibleContent(page, filename)
  const destination = path.join(outputDir, filename)
  await page.screenshot({
    path: destination,
    animations: 'disabled',
    caret: 'hide',
    fullPage: false,
  })
  const { width, height } = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
  console.log(`Captured ${filename} (${width}x${height})`)
}

async function capturePublic(browser) {
  const { context, page } = await newPage(browser)
  try {
    await goto(page, '/', 'Find honest local work')
    await screenshot(page, outputFiles.landing)

    await goto(page, '/jobs', 'Browse Jobs')
    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Construction & Repair' })
    await page.getByLabel('Subcategory', { exact: true }).selectOption({ label: 'Electrical' })
    await settle(page, 'Electrical Safety Inspection and Repair for School')
    await screenshot(page, outputFiles.jobs)
  } finally {
    await context.close()
  }

  const mobile = await newPage(browser, { viewport: mobileViewport })
  try {
    await goto(mobile.page, '/jobs', 'Browse Jobs')
    await mobile.page.evaluate(() => window.scrollTo(0, 330))
    await mobile.page.waitForTimeout(200)
    await screenshot(mobile.page, outputFiles.mobileJobs)
  } finally {
    await mobile.context.close()
  }
}

async function captureWorker(browser) {
  const worker = await newPage(browser, { username: 'demo_worker_electrician' })
  try {
    await goto(worker.page, '/worker/profile', 'Worker Profile')
    const skillsHeading = worker.page.getByRole('heading', { name: 'Skills', exact: true })
    await skillsHeading.scrollIntoViewIfNeeded()
    await worker.page.evaluate(() => window.scrollBy(0, -160))
    await screenshot(worker.page, outputFiles.workerProfile)

    await goto(worker.page, '/worker/recommendations', 'Recommended Jobs')
    await worker.page.getByRole('button', { name: 'Why this match?' }).first().click()
    await settle(worker.page, 'Trust & reliability')
    await screenshot(worker.page, outputFiles.workerRecommendations)

    await goto(worker.page, '/worker/applications', 'My Applications')
    await settle(worker.page, 'Completed')
    await screenshot(worker.page, outputFiles.workerApplications)

    await goto(worker.page, '/worker/cv', 'Your CV')
    const frame = worker.page.frameLocator('iframe[title="CV preview"]')
    await frame.getByText('Professional Summary', { exact: true }).waitFor({ timeout: 20_000 })
    await worker.page.locator('iframe[title="CV preview"]').scrollIntoViewIfNeeded()
    await worker.page.evaluate(() => window.scrollBy(0, -90))
    await screenshot(worker.page, outputFiles.workerCv)
  } finally {
    await worker.context.close()
  }

  const hari = await newPage(browser, { username: 'demo_worker_hari' })
  try {
    await goto(hari.page, '/worker/opportunities', 'Opportunity Advisory')
    await settle(hari.page, 'Floor Tiling and Masonry Repair for Guest House')
    await screenshot(hari.page, outputFiles.opportunityNearMiss)

    const skillHeading = hari.page.getByRole('heading', { name: 'Skills that would help' })
    await skillHeading.waitFor({ state: 'visible' })
    await hari.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await settle(hari.page, 'Tile Installation')
    await screenshot(hari.page, outputFiles.opportunitySkills)
  } finally {
    await hari.context.close()
  }
}

async function houseWiringJobId() {
  const jobs = await requestJson(`${backendOrigin}/api/jobs/browse/`)
  const job = jobs.find((candidate) => candidate.title === 'House Wiring for New Apartment Block')
  if (!job) throw new Error('Seeded House Wiring job was not found')
  return job.id
}

async function captureEmployer(browser) {
  const jobId = await houseWiringJobId()
  const employer = await newPage(browser, { username: 'demo_employer_verified' })
  try {
    await goto(employer.page, '/employer/jobs', 'My Jobs')
    await settle(employer.page, 'House Wiring for New Apartment Block')
    await screenshot(employer.page, outputFiles.employerJobs)

    await goto(employer.page, `/employer/jobs/${jobId}/applications`, 'Applications')
    await settle(employer.page, 'demo_worker_electrician')
    await employer.page.evaluate(() => window.scrollTo(0, 0))
    await screenshot(employer.page, outputFiles.employerApplications)

    await goto(employer.page, `/employer/jobs/${jobId}/recommendations`, 'Recommended Workers')
    await employer.page.getByRole('button', { name: 'Why this match?' }).first().click()
    await settle(employer.page, 'Trust & reliability')
    await employer.page.evaluate(() => window.scrollTo(0, 0))
    await screenshot(employer.page, outputFiles.employerRecommendations)
  } finally {
    await employer.context.close()
  }

  const pending = await newPage(browser, { username: 'demo_employer_pending' })
  try {
    await goto(pending.page, '/employer', 'Welcome, demo_employer_pending')
    await settle(pending.page, 'Available once your account is verified')
    await screenshot(pending.page, outputFiles.pendingEmployer)
  } finally {
    await pending.context.close()
  }
}

async function captureAdmin(browser) {
  const { context, page } = await newPage(browser)
  try {
    const target = `${backendOrigin}/admin/profiles/employerprofile/?verification_status__exact=PENDING`
    await page.goto(`${backendOrigin}/admin/login/?next=${encodeURIComponent(target)}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.getByLabel('Username').fill('demo_admin')
    await page.getByLabel('Password').fill(demoPassword)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.waitForURL(/\/admin\//, { timeout: 20_000 })

    await page.goto(target, { waitUntil: 'domcontentloaded' })
    await settle(page, 'demo_employer_pending')
    await screenshot(page, outputFiles.adminEmployers)

    await page.goto(
      `${backendOrigin}/admin/taxonomy/unmatchedskillterm/?status__exact=PENDING`,
      { waitUntil: 'domcontentloaded' },
    )
    await settle(page, 'cnc machine operation')
    await screenshot(page, outputFiles.adminTaxonomy)
  } finally {
    await context.close()
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  await assertServicesReady()

  const { chromium } = loadPlaywright()
  const executablePath = findBrowserExecutable()
  if (!executablePath) {
    throw new Error('No supported system Chrome/Edge executable was found')
  }

  console.log(`Using browser: ${executablePath}`)
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-notifications',
      '--disable-sync',
      '--disable-translate',
      '--disable-save-password-bubble',
      '--no-default-browser-check',
      '--no-first-run',
    ],
  })

  try {
    await capturePublic(browser)
    await captureWorker(browser)
    await captureEmployer(browser)
    await captureAdmin(browser)
  } finally {
    await browser.close()
  }

  const missing = Object.values(outputFiles).filter(
    (filename) => !fs.existsSync(path.join(outputDir, filename)),
  )
  if (missing.length) throw new Error(`Missing captures: ${missing.join(', ')}`)
  console.log(`Done: ${Object.keys(outputFiles).length} report-ready PNG files in ${outputDir}`)
}

main().catch((error) => {
  console.error(error.stack || error.message || error)
  process.exitCode = 1
})
