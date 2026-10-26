import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium, defineConfig } from '@playwright/test'

function discoverCachedChromium(): string | undefined {
  const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), '.cache/ms-playwright')
  if (!existsSync(browserPath)) return undefined

  const revisions = readdirSync(browserPath, { withFileTypes: true })
    .flatMap((entry) => {
      const match = /^chromium-(\d+)$/.exec(entry.name)
      return entry.isDirectory() && match
        ? [{ revision: Number(match[1]), path: join(browserPath, entry.name) }]
        : []
    })
    .sort((left, right) => right.revision - left.revision)

  const executablePaths = process.arch === 'arm64'
    ? ['chrome-linux-arm64/chrome', 'chrome-linux/chrome']
    : ['chrome-linux64/chrome', 'chrome-linux/chrome']

  for (const revision of revisions) {
    for (const relativePath of executablePaths) {
      const executable = join(revision.path, relativePath)
      if (existsSync(executable)) return executable
    }
  }
}

const chromiumPath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  chromium.executablePath(),
  discoverCachedChromium(),
].find((path): path is string => Boolean(path && existsSync(path)))

if (!chromiumPath) {
  throw new Error(
    'Chromium executable not found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or install a compatible browser in PLAYWRIGHT_BROWSERS_PATH or ~/.cache/ms-playwright.',
  )
}

export default defineConfig({
  testDir: '.',
  testMatch: 'dashboard.spec.ts',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    launchOptions: { executablePath: chromiumPath },
  },
})
