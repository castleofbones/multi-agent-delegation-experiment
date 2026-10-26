import { createServer } from 'node:http'

const port = Number(process.env.PORT)
const server = createServer((request, response) => {
  if (request.url !== '/destination' && request.url !== '/unrelated') {
    response.writeHead(404).end('Not found')
    return
  }

  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end('<!doctype html><html><body><h1>Deterministic E2E destination</h1></body></html>')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`E2E destination listening on http://127.0.0.1:${port}`)
})
