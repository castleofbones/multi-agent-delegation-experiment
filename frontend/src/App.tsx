import { useEffect, useState } from 'react'

function App() {
  const [health, setHealth] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timeout = setTimeout(() => controller.abort(), 5000)

    async function checkHealth() {
      try {
        const response = await fetch('/api/health', { signal: controller.signal })
        if (!response.ok) throw new Error(`Health request failed: ${response.status}`)

        const data: unknown = await response.json()
        if (
          typeof data !== 'object' ||
          data === null ||
          !('status' in data) ||
          data.status !== 'ok' ||
          !('service' in data) ||
          data.service !== 'backend'
        ) {
          throw new Error('Invalid health response')
        }
        if (active) setHealth('ok')
      } catch {
        if (active) setHealth('error')
      } finally {
        clearTimeout(timeout)
      }
    }

    void checkHealth()
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  return (
    <main>
      <h1>Multi-Agent Playground</h1>
      {health === 'loading' && <p role="status">Checking backend health…</p>}
      {health === 'ok' && <p role="status">Backend status: ok</p>}
      {health === 'error' && (
        <p role="alert">
          Unable to reach a healthy backend. Check that the backend is running and refresh the page.
        </p>
      )}
    </main>
  )
}

export default App
