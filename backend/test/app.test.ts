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

test('unknown API routes return the JSON not-found response', async (t) => {
  const api = await startApp()
  t.after(api.close)

  const response = await fetch(`${api.url}/api/unknown`)

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'Not found' })
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

test('lists saved links with usage counts in deterministic alias order', async (t) => {
  const api = await startApp()
  t.after(api.close)

  for (const link of [
    { alias: 'z-last', url: 'https://last.example' },
    { alias: 'A-first', url: 'https://first.example' },
  ]) {
    const response = await fetch(`${api.url}/api/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(link),
    })
    assert.equal(response.status, 201)
  }
  await fetch(`${api.url}/z-last`, { redirect: 'manual' })
  await fetch(`${api.url}/z-last`, { redirect: 'manual' })

  const response = await fetch(`${api.url}/api/links`)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), [
    { alias: 'A-first', url: 'https://first.example', usageCount: 0, tags: [] },
    { alias: 'z-last', url: 'https://last.example', usageCount: 2, tags: [] },
  ])
})

test('deletes a link with HTTP 204 and returns 404 for an unknown alias', async (t) => {
  const api = await startApp()
  t.after(api.close)
  const createResponse = await fetch(`${api.url}/api/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://delete.example', alias: 'remove-me' }),
  })
  assert.equal(createResponse.status, 201)

  const deleted = await fetch(`${api.url}/api/links/remove-me`, { method: 'DELETE' })
  assert.equal(deleted.status, 204)
  assert.equal(await deleted.text(), '')
  assert.deepEqual(await (await fetch(`${api.url}/api/links`)).json(), [])

  const missing = await fetch(`${api.url}/api/links/unknown`, { method: 'DELETE' })
  assert.equal(missing.status, 404)
  assert.deepEqual(await missing.json(), { error: 'Not found' })
})

test('updates a link destination while preserving alias and usage count', async (t) => {
  const api = await startApp()
  t.after(api.close)
  api.database.prepare(
    'INSERT INTO links (alias, destination_url, usage_count) VALUES (?, ?, ?)',
  ).run('update-me', 'https://before.example', 7)

  const response = await fetch(`${api.url}/api/links/update-me`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://after.example/path' }),
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    alias: 'update-me',
    url: 'https://after.example/path',
    usageCount: 7,
  })
  assert.deepEqual(
    {
      ...api.database
        .prepare('SELECT alias, destination_url, usage_count FROM links WHERE alias = ?')
        .get('update-me'),
    },
    { alias: 'update-me', destination_url: 'https://after.example/path', usage_count: 7 },
  )

  const redirect = await fetch(`${api.url}/update-me`, { redirect: 'manual' })
  assert.equal(redirect.status, 302)
  assert.equal(redirect.headers.get('location'), 'https://after.example/path')
})

test('rejects invalid update input without changing the stored link', async (t) => {
  const api = await startApp()
  t.after(api.close)
  api.database.prepare(
    'INSERT INTO links (alias, destination_url, usage_count) VALUES (?, ?, ?)',
  ).run('unchanged', 'https://original.example', 3)

  const invalidInputs = [
    { body: [], error: 'Request body must be a JSON object' },
    { body: {}, error: 'url must be an absolute HTTP or HTTPS URL' },
    { body: { url: 'ftp://invalid.example' }, error: 'url must be an absolute HTTP or HTTPS URL' },
    { body: { url: 'not a URL' }, error: 'url must be an absolute HTTP or HTTPS URL' },
  ]
  for (const { body, error } of invalidInputs) {
    const response = await fetch(`${api.url}/api/links/unchanged`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error })
  }

  assert.deepEqual(
    {
      ...api.database
        .prepare('SELECT alias, destination_url, usage_count FROM links WHERE alias = ?')
        .get('unchanged'),
    },
    { alias: 'unchanged', destination_url: 'https://original.example', usage_count: 3 },
  )
})

test('returns the consistent not-found response when updating a missing link', async (t) => {
  const api = await startApp()
  t.after(api.close)

  const response = await fetch(`${api.url}/api/links/missing`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com' }),
  })

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'Not found' })
})

test('persists an updated destination across database connections', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'links-update-api-'))
  const databasePath = join(directory, 'links.sqlite')
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const api = await startApp(databasePath)
  t.after(api.close)
  api.database.prepare(
    'INSERT INTO links (alias, destination_url, usage_count) VALUES (?, ?, ?)',
  ).run('persistent-update', 'https://before.example', 4)

  const response = await fetch(`${api.url}/api/links/persistent-update`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://after.example' }),
  })
  assert.equal(response.status, 200)
  await api.close()

  const reopenedDatabase = new DatabaseSync(databasePath)
  try {
    assert.deepEqual(
      { ...reopenedDatabase.prepare('SELECT alias, destination_url, usage_count FROM links').get() },
      { alias: 'persistent-update', destination_url: 'https://after.example', usage_count: 4 },
    )
  } finally {
    reopenedDatabase.close()
  }
})

test('creates trimmed unique tags, lists them, and deletes them', async (t) => {
  const api = await startApp()
  t.after(api.close)
  const created = await fetch(`${api.url}/api/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ alias: 'tagged', url: 'https://tagged.example' }),
  })
  assert.equal(created.status, 201)

  const add = (tag: unknown) => fetch(`${api.url}/api/links/tagged/tags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tag }),
  })
  const added = await add('  work  ')
  assert.equal(added.status, 201)
  assert.deepEqual(await added.json(), { alias: 'tagged', tags: ['work'] })
  assert.equal((await add('work')).status, 409)
  assert.equal((await add('Work')).status, 201)

  const listed = await fetch(`${api.url}/api/links`)
  assert.deepEqual(await listed.json(), [
    { alias: 'tagged', url: 'https://tagged.example', usageCount: 0, tags: ['Work', 'work'] },
  ])

  const deleted = await fetch(`${api.url}/api/links/tagged/tags/work`, { method: 'DELETE' })
  assert.equal(deleted.status, 204)
  assert.equal((await fetch(`${api.url}/api/links/tagged/tags/work`, { method: 'DELETE' })).status, 404)
  assert.deepEqual(
    api.database.prepare('SELECT tag FROM link_tags WHERE alias = ?').all('tagged')
      .map((row) => row.tag),
    ['Work'],
  )
})

test('rejects invalid tags and reports missing links consistently', async (t) => {
  const api = await startApp()
  t.after(api.close)

  for (const tag of ['', '   ', 1, null, {}]) {
    const response = await fetch(`${api.url}/api/links/missing/tags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tag }),
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'tag must be a non-empty string' })
  }
  const missingAdd = await fetch(`${api.url}/api/links/missing/tags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tag: 'valid' }),
  })
  assert.equal(missingAdd.status, 404)
  assert.deepEqual(await missingAdd.json(), { error: 'Not found' })

  const missingDelete = await fetch(`${api.url}/api/links/missing/tags/valid`, { method: 'DELETE' })
  assert.equal(missingDelete.status, 404)
  assert.deepEqual(await missingDelete.json(), { error: 'Not found' })
})

test('migrates an existing link database and persists tags across reopening', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'links-tags-api-'))
  const databasePath = join(directory, 'links.sqlite')
  t.after(() => rmSync(directory, { recursive: true, force: true }))

  const legacyDatabase = new DatabaseSync(databasePath)
  legacyDatabase.exec(`
    CREATE TABLE links (
      alias TEXT PRIMARY KEY COLLATE BINARY,
      destination_url TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO links (alias, destination_url) VALUES ('legacy', 'https://legacy.example');
  `)
  legacyDatabase.close()

  const api = await startApp(databasePath)
  t.after(api.close)
  const response = await fetch(`${api.url}/api/links/legacy/tags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tag: ' persisted ' }),
  })
  assert.equal(response.status, 201)
  await api.close()

  const reopenedDatabase = new DatabaseSync(databasePath)
  try {
    createApp(reopenedDatabase)
    assert.deepEqual(
      reopenedDatabase.prepare('SELECT alias, tag FROM link_tags').all()
        .map((row) => [row.alias, row.tag]),
      [['legacy', 'persisted']],
    )
  } finally {
    reopenedDatabase.close()
  }
})

test('deleting a link also deletes its tags', async (t) => {
  const api = await startApp()
  t.after(api.close)
  api.database.prepare('INSERT INTO links (alias, destination_url) VALUES (?, ?)')
    .run('cleanup', 'https://cleanup.example')
  api.database.prepare('INSERT INTO link_tags (alias, tag) VALUES (?, ?)').run('cleanup', 'tag')

  const response = await fetch(`${api.url}/api/links/cleanup`, { method: 'DELETE' })

  assert.equal(response.status, 204)
  assert.deepEqual(api.database.prepare('SELECT * FROM link_tags').all(), [])
})

test('redirects to the stored destination with HTTP 302', async (t) => {
  const api = await startApp()
  t.after(api.close)
  api.database.prepare(
    'INSERT INTO links (alias, destination_url) VALUES (?, ?)',
  ).run('go-there', 'https://destination.example/path?value=1')

  const response = await fetch(`${api.url}/go-there`, { redirect: 'manual' })

  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), 'https://destination.example/path?value=1')
})

test('increments usage count for each redirect, including concurrent requests', async (t) => {
  const api = await startApp()
  t.after(api.close)
  api.database.prepare(
    'INSERT INTO links (alias, destination_url) VALUES (?, ?)',
  ).run('counted', 'https://destination.example')

  const responses = await Promise.all(
    Array.from({ length: 10 }, () => fetch(`${api.url}/counted`, { redirect: 'manual' })),
  )

  assert.deepEqual(responses.map((response) => response.status), Array(10).fill(302))
  assert.equal(
    api.database.prepare('SELECT usage_count FROM links WHERE alias = ?').get('counted')?.usage_count,
    10,
  )
})

test('returns 404 for unknown aliases and preserves case-sensitive lookup', async (t) => {
  const api = await startApp()
  t.after(api.close)
  api.database.prepare(
    'INSERT INTO links (alias, destination_url) VALUES (?, ?)',
  ).run('MixedCase', 'https://destination.example')

  const missing = await fetch(`${api.url}/missing`, { redirect: 'manual' })
  const wrongCase = await fetch(`${api.url}/mixedcase`, { redirect: 'manual' })
  const exact = await fetch(`${api.url}/MixedCase`, { redirect: 'manual' })

  assert.equal(missing.status, 404)
  assert.equal(wrongCase.status, 404)
  assert.equal(exact.status, 302)
  assert.equal(exact.headers.get('location'), 'https://destination.example')
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
    { url: 'https://example.com', alias: 'assets' },
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
  const firstRedirect = await fetch(`${api.url}/persistent`, { redirect: 'manual' })
  const secondRedirect = await fetch(`${api.url}/persistent`, { redirect: 'manual' })
  assert.equal(firstRedirect.status, 302)
  assert.equal(secondRedirect.status, 302)
  await api.close()

  const reopenedDatabase = new DatabaseSync(databasePath)
  try {
    assert.deepEqual(
      { ...reopenedDatabase.prepare('SELECT alias, destination_url, usage_count FROM links').get() },
      { alias: 'persistent', destination_url: 'https://persist.example', usage_count: 2 },
    )
  } finally {
    reopenedDatabase.close()
  }
})
