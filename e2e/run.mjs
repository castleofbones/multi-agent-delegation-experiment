import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const children = []
let temporaryDirectory

async function availablePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Unable to allocate a local port')
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()))
  return address.port
}

function start(command, args, options) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options })
  const processState = {
    child,
    command,
    error: undefined,
    closed: false,
    completion: undefined,
  }
  processState.completion = new Promise((resolveClose) => {
    child.once('close', (code, signal) => {
      processState.closed = true
      resolveClose({ code, signal })
    })
  })
  child.on('error', (error) => { processState.error = error })
  children.push(processState)
  return processState
}

function waitForCloseOrTimeout(processState, milliseconds) {
  if (processState.closed) return Promise.resolve(true)

  return new Promise((resolveClose) => {
    const timeout = setTimeout(() => resolveClose(false), milliseconds)
    processState.completion.then(() => {
      clearTimeout(timeout)
      resolveClose(true)
    })
  })
}

async function stop(processState) {
  if (processState.closed) return processState.completion

  processState.child.kill('SIGTERM')
  if (await waitForCloseOrTimeout(processState, 3000)) return

  if (!processState.closed) processState.child.kill('SIGKILL')
  await processState.completion
}

async function waitFor(url, processState) {
  const deadline = Date.now() + 15_000
  let lastError
  while (Date.now() < deadline) {
    if (processState.error) {
      throw new Error(`Unable to start ${processState.command}`, { cause: processState.error })
    }
    if (processState.closed) {
      throw new Error(`Process exited before becoming ready: ${url}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`Readiness request returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 200))
  }
  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`)
}

let cleanupPromise
async function cleanup() {
  if (!cleanupPromise) {
    cleanupPromise = (async () => {
      for (const child of children.reverse()) await stop(child)
      if (temporaryDirectory) {
        await rm(temporaryDirectory, { recursive: true, force: true })
      }
    })()
  }
  return cleanupPromise
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143))
  })
}

try {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'multi-agent-e2e-'))
  const appPort = await availablePort()
  const destinationPort = await availablePort()
  const appUrl = `http://127.0.0.1:${appPort}`
  const destinationUrl = `http://127.0.0.1:${destinationPort}/destination`

  const destination = start(process.execPath, ['e2e/destination.mjs'], {
    env: { ...process.env, PORT: String(destinationPort) },
  })
  const app = start(process.execPath, ['backend/dist/index.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(appPort),
      LINKS_DATABASE_PATH: join(temporaryDirectory, 'links.sqlite'),
    },
  })

  await Promise.all([
    waitFor(destinationUrl, destination),
    waitFor(`${appUrl}/api/health`, app),
  ])

  const playwright = start(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config=e2e/playwright.config.ts'], {
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: appUrl,
      E2E_DESTINATION_URL: destinationUrl,
      PLAYWRIGHT_OUTPUT_DIR: join(temporaryDirectory, 'playwright-results'),
    },
  })
  const { code, signal } = await playwright.completion
  if (playwright.error) {
    throw new Error('Unable to start Playwright', { cause: playwright.error })
  }
  if (signal) throw new Error(`Playwright exited due to ${signal}`)
  process.exitCode = code ?? 1
} catch (error) {
  console.error('Browser E2E setup or execution failed:', error)
  process.exitCode = 1
} finally {
  await cleanup()
}
