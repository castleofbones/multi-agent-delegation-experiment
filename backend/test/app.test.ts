import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { app } from '../src/app.js'

test('health endpoint returns HTTP 200 and identifies the backend', async (t) => {
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo

  const response = await fetch(`http://127.0.0.1:${port}/api/health`)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok', service: 'backend' })
})
