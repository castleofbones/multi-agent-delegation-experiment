import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('backend health', () => {
  it('shows a loading state while waiting for the backend', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Checking backend health')
  })

  it('displays the backend health status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', service: 'backend' })),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Multi-Agent Playground' })).toBeInTheDocument()
    expect(await screen.findByText('Backend status: ok')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/health', {
      signal: expect.any(AbortSignal),
    })
  })

  it('displays a useful error when the backend is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check that the backend is running and refresh the page',
    )
  })

  it.each([
    new Response(null, { status: 503 }),
    new Response(JSON.stringify({ status: 'unexpected' })),
    new Response('not JSON'),
  ])('displays an error for an unsuccessful or invalid response (%#)', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach a healthy backend')
  })
})
