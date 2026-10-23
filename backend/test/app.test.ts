import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { createApp } from '../src/app.js'

type AliasGenerator = () => string

async function startApp(
  databasePath = ':memory:',
  aliasGenerator?: AliasGenerator,
) {
  const database = new DatabaseSync(databasePath)
  const app = createApp(database, aliasGenerator)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  let closed = false

  return {
    database,
    url: `http://127.0.0.1:${port}`,
    async close() {
      if (closed) return
      closed = true
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
      database.close()
    },
  }
}

test('health endpoint returns HTTP 200 and identifies the backend', async (t) => {
  const api = await startApp()
  t.after(api.close)

  const response = await fetch(`${api.url}/api/health`)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok', service: 'backend' })
})

test('creates a link and stores its destination and initial usage count', async (t) => {
  const api = await startApp()
  t.after(api.close)

  const response = await fetch(`${api.url}/api/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/path', alias: 'my-link_1' }),
  })

  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), {
    alias: 'my-link_1',
    url: 'https://example.com/path',
    usageCount: 0,
  })
  assert.deepEqual(
    { ...api.database.prepare('SELECT alias, destination_url, usage_count FROM links').get() },
    { alias: 'my-link_1', destination_url: 'https://example.com/path', usage_count: 0 },
  )
})

test('rejects invalid request bodies, URLs and custom aliases', async (t) => {
  const api = await startApp()
  t.after(api.close)

  const invalidInputs: unknown[] = [
    null,
    [],
    {},
    { url: 'ftp://example.com' },
    { url: 'not a URL' },
    { url: 'https://example.com', alias: '' },
    { url: 'https://example.com', alias: 'has space' },
    { url: 'https://example.com', alias: 'non-ASCII-é' },
    { url: 'https://example.com', alias: 'api' },
    { url: 'https://example.com', alias: 'health' },
  ]

  for (const input of invalidInputs) {
    const response = await fetch(`${api.url}/api/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(input)}`)
  }
})

test('rejects duplicate aliases but treats aliases as case-sensitive', async (t) => {
  const api = await startApp()
  t.after(api.close)
  const create = (alias: string) => fetch(`${api.url}/api/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com', alias }),
  })

  assert.equal((await create('Example')).status, 201)
  assert.equal((await create('Example')).status, 409)
  assert.equal((await create('example')).status, 201)
})

test('retries generated aliases that collide with existing rows', async (t) => {
  const aliases = ['taken', 'available']
  let generatorCalls = 0
  const api = await startApp(':memory:', () => aliases[generatorCalls++]!)
  t.after(api.close)
  api.database.prepare(
    'INSERT INTO links (alias, destination_url) VALUES (?, ?)',
  ).run('taken', 'https://existing.example')

  const response = await fetch(`${api.url}/api/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'http://example.org' }),
  })

  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), {
    alias: 'available',
    url: 'http://example.org',
    usageCount: 0,
  })
  assert.equal(generatorCalls, 2)
})

test('returns a server error after generated alias retries are exhausted', async (t) => {
  let generatorCalls = 0
  const api = await startApp(':memory:', () => {
    generatorCalls += 1
    return 'taken'
  })
  t.after(api.close)
  api.database.prepare(
    'INSERT INTO links (alias, destination_url) VALUES (?, ?)',
  ).run('taken', 'https://existing.example')

  const response = await fetch(`${api.url}/api/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.org' }),
  })

  assert.equal(generatorCalls, 10)
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'Internal server error' })
})

test('persists created links across database connections', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'links-api-'))
  const databasePath = join(directory, 'links.sqlite')
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const api = await startApp(databasePath, () => 'persistent')
  t.after(api.close)

  const response = await fetch(`${api.url}/api/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://persist.example' }),
  })
  assert.equal(response.status, 201)
  await api.close()

  const reopenedDatabase = new DatabaseSync(databasePath)
  try {
    assert.deepEqual(
      { ...reopenedDatabase.prepare('SELECT alias, destination_url, usage_count FROM links').get() },
      { alias: 'persistent', destination_url: 'https://persist.example', usage_count: 0 },
    )
  } finally {
    reopenedDatabase.close()
  }
})
