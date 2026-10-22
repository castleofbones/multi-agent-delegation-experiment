import express from 'express'
import type { ErrorRequestHandler } from 'express'

export const app = express()
app.disable('x-powered-by')

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'backend' })
})

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' })
})

const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ error: 'Internal server error' })
}

app.use(handleError)
