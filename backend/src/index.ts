import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 3001)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}
const host = process.env.HOST ?? '127.0.0.1'

const databasePath = resolve(process.env.LINKS_DATABASE_PATH ?? 'data/links.sqlite')
mkdirSync(dirname(databasePath), { recursive: true })
const database = new DatabaseSync(databasePath)
const app = createApp(database)

const server = app.listen(port, host, () => {
  console.log(`Backend listening on http://${host}:${port}`)
})

server.on('error', (error) => {
  console.error('Unable to start backend:', error)
  process.exitCode = 1
})
