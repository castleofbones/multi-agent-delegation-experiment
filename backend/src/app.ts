import { randomInt } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import type { ErrorRequestHandler } from 'express'
import type { DatabaseSync } from 'node:sqlite'

const aliasCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const reservedAliases = new Set(['api', 'assets', 'health', 'links'])
const aliasLength = 8
const maxAliasAttempts = 10

type AliasGenerator = () => string

function generateAlias(): string {
  return Array.from({ length: aliasLength }, () =>
    aliasCharacters[randomInt(aliasCharacters.length)],
  ).join('')
}

function isAliasConflictError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('errcode' in error)) {
    return false
  }

  // SQLite extended result codes for PRIMARY KEY and UNIQUE violations.
  return error.errcode === 1555 || error.errcode === 2067
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidDestinationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isValidCustomAlias(value: unknown): value is string {
  return typeof value === 'string'
    && /^[A-Za-z0-9_-]+$/.test(value)
    && !reservedAliases.has(value)
}

export function createApp(database: DatabaseSync, aliasGenerator: AliasGenerator = generateAlias) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS links (
      alias TEXT PRIMARY KEY COLLATE BINARY,
      destination_url TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0
    )
  `)

  const insertLink = database.prepare(
    'INSERT INTO links (alias, destination_url, usage_count) VALUES (?, ?, 0)',
  )
  const incrementAndGetLink = database.prepare(
    'UPDATE links SET usage_count = usage_count + 1 WHERE alias = ? RETURNING destination_url',
  )
  const listLinks = database.prepare(
    'SELECT alias, destination_url, usage_count FROM links ORDER BY alias COLLATE BINARY',
  )
  const updateLinkDestination = database.prepare(
    'UPDATE links SET destination_url = ? WHERE alias = ? RETURNING alias, destination_url, usage_count',
  )
  const deleteLink = database.prepare('DELETE FROM links WHERE alias = ?')
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json())

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'backend' })
  })

  app.get('/api/links', (_request, response) => {
    const links = listLinks.all().map((link) => ({
      alias: link.alias,
      url: link.destination_url,
      usageCount: link.usage_count,
    }))
    response.json(links)
  })

  app.patch('/api/links/:alias', (request, response) => {
    const input: unknown = request.body
    if (!isRecord(input)) {
      response.status(400).json({ error: 'Request body must be a JSON object' })
      return
    }
    if (!isValidDestinationUrl(input.url)) {
      response.status(400).json({ error: 'url must be an absolute HTTP or HTTPS URL' })
      return
    }

    const link = updateLinkDestination.get(input.url, request.params.alias)
    if (!link) {
      response.status(404).json({ error: 'Not found' })
      return
    }

    response.status(200).json({
      alias: link.alias,
      url: link.destination_url,
      usageCount: link.usage_count,
    })
  })

  app.delete('/api/links/:alias', (request, response) => {
    const result = deleteLink.run(request.params.alias)
    if (result.changes === 0) {
      response.status(404).json({ error: 'Not found' })
      return
    }

    response.status(204).end()
  })

  app.post('/api/links', (request, response, next) => {
    const input: unknown = request.body
    if (!isRecord(input)) {
      response.status(400).json({ error: 'Request body must be a JSON object' })
      return
    }
    if (!isValidDestinationUrl(input.url)) {
      response.status(400).json({ error: 'url must be an absolute HTTP or HTTPS URL' })
      return
    }

    if (Object.hasOwn(input, 'alias')) {
      const alias = input.alias
      if (!isValidCustomAlias(alias)) {
        response.status(400).json({ error: 'alias is invalid or reserved' })
        return
      }

      try {
        insertLink.run(alias, input.url)
      } catch (error) {
        if (isAliasConflictError(error)) {
          response.status(409).json({ error: 'alias already exists' })
          return
        }
        next(error)
        return
      }
      response.status(201).json({ alias, url: input.url, usageCount: 0 })
      return
    }

    for (let attempt = 0; attempt < maxAliasAttempts; attempt += 1) {
      const alias = aliasGenerator()
      try {
        insertLink.run(alias, input.url)
        response.status(201).json({ alias, url: input.url, usageCount: 0 })
        return
      } catch (error) {
        if (!isAliasConflictError(error)) {
          next(error)
          return
        }
      }
    }

    next(new Error('Unable to generate a unique alias'))
  })

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'Not found' })
  })

  if (process.env.NODE_ENV === 'production') {
    const frontendDistPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../frontend/dist',
    )
    app.use(express.static(frontendDistPath))
  }

  // Do not add a catch-all SPA fallback: unknown aliases must remain 404s.
  app.get('/:alias', (request, response) => {
    const link = incrementAndGetLink.get(request.params.alias)

    if (typeof link?.destination_url !== 'string') {
      response.status(404).json({ error: 'Not found' })
      return
    }

    response.redirect(302, link.destination_url)
  })

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' })
  })

  const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
      response.status(400).json({ error: 'Request body must be valid JSON' })
      return
    }
    console.error(error)
    response.status(500).json({ error: 'Internal server error' })
  }
  app.use(handleError)

  return app
}
