import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const link = { alias: 'docs', url: 'https://example.com/docs', usageCount: 7 }

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setupClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { clipboard: { writeText } }))
  return writeText
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))
})

describe('link dashboard', () => {
  it('shows loading and then an empty state', async () => {
    let resolveList!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveList = resolve })))

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading your links')
    const createButton = screen.getByRole('button', { name: 'Create short link' })
    expect(createButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com' } })
    fireEvent.click(createButton)
    expect(fetch).toHaveBeenCalledTimes(1)

    resolveList(jsonResponse([]))
    expect(await screen.findByText('No links yet. Create one above to get started.')).toBeInTheDocument()
    expect(createButton).toBeEnabled()
  })

  it('lists links with the full short URL, destination and usage count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([link])))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'docs' })).toBeInTheDocument()
    const shortUrl = `${window.location.origin}/docs`
    expect(screen.getByRole('link', { name: shortUrl })).toHaveAttribute('href', shortUrl)
    expect(screen.getByRole('link', { name: link.url })).toHaveAttribute('target', '_blank')
    expect(screen.getByText('7 visits')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/links', { signal: expect.any(AbortSignal) })
  })

  it('creates a generated short link without sending a custom alias', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ alias: 'generated1', url: 'https://example.com', usageCount: 0 }, 201))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await screen.findByText('No links yet. Create one above to get started.')
    fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create short link' }))

    expect(await screen.findByRole('heading', { name: 'generated1' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    expect(await screen.findByRole('status')).toHaveTextContent(`${window.location.origin}/generated1`)
  })

  it('creates a link with a custom alias', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ alias: 'my-link', url: 'https://example.com/page', usageCount: 0 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await screen.findByText('No links yet. Create one above to get started.')
    fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/page' } })
    fireEvent.change(screen.getByLabelText(/Custom alias/), { target: { value: 'my-link' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create short link' }))

    expect(await screen.findByRole('heading', { name: 'my-link' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/links', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/page', alias: 'my-link' }),
    }))
  })

  it('copies a short URL and confirms deletion before removing the link', async () => {
    const writeText = setupClipboard()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([link]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirm)

    render(<App />)
    const item = await screen.findByRole('heading', { name: 'docs' }).then((heading) => heading.closest('li'))
    expect(item).not.toBeNull()
    fireEvent.click(within(item as HTMLElement).getByRole('button', { name: 'Copy' }))
    const shortUrl = `${window.location.origin}/docs`
    expect(await screen.findByRole('status')).toHaveTextContent(`Copied ${shortUrl} to clipboard`)
    expect(writeText).toHaveBeenCalledWith(shortUrl)

    fireEvent.click(within(item as HTMLElement).getByRole('button', { name: 'Delete' }))
    expect(confirm).toHaveBeenCalledWith('Delete the short link “docs”? This cannot be undone.')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.click(within(item as HTMLElement).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Deleted short link “docs”.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/links/docs', { method: 'DELETE' })
    expect(screen.queryByRole('heading', { name: 'docs' })).not.toBeInTheDocument()
  })

  it('falls back to a temporary textarea when the clipboard API rejects the copy', async () => {
    const writeText = setupClipboard()
    writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'))
    const previousExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')
    let copiedText = ''
    const execCommand = vi.fn(() => {
      copiedText = document.querySelector('textarea')?.value ?? ''
      return true
    })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([link])))
    const view = render(<App />)

    try {
      const shortUrl = `${window.location.origin}/docs`
      const item = await screen.findByRole('heading', { name: 'docs' }).then((heading) => heading.closest('li'))
      fireEvent.click(within(item as HTMLElement).getByRole('button', { name: 'Copy' }))

      expect(await screen.findByRole('status')).toHaveTextContent(`Copied ${shortUrl} to clipboard`)
      expect(writeText).toHaveBeenCalledWith(shortUrl)
      expect(execCommand).toHaveBeenCalledWith('copy')
      expect(copiedText).toBe(shortUrl)
      expect(document.querySelector('textarea')).not.toBeInTheDocument()
    } finally {
      view.unmount()
      if (previousExecCommand) {
        Object.defineProperty(document, 'execCommand', previousExecCommand)
      } else {
        Reflect.deleteProperty(document, 'execCommand')
      }
    }
  })

  it('disables creation after the initial list load fails and allows retrying', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Storage unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable')
    const createButton = screen.getByRole('button', { name: 'Create short link' })
    expect(createButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com' } })
    fireEvent.click(createButton)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/links', { signal: expect.any(AbortSignal) })

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No links yet. Create one above to get started.')).toBeInTheDocument()
    expect(createButton).toBeEnabled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/links', { signal: expect.any(AbortSignal) })
  })

  it('reports create and delete errors without removing existing links', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([link]))
      .mockResolvedValueOnce(jsonResponse({ error: 'Alias already exists' }, 409))
      .mockResolvedValueOnce(jsonResponse({ error: 'Not found' }, 404))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))

    render(<App />)
    await screen.findByRole('heading', { name: 'docs' })
    fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://another.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create short link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Alias already exists')

    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not found')
    expect(screen.getByRole('heading', { name: 'docs' })).toBeInTheDocument()
  })

  it('filters links by alias as the query is typed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([
      link,
      { alias: 'blog', url: 'https://example.com/articles', usageCount: 2 },
    ])))
    render(<App />)
    await screen.findByRole('heading', { name: 'docs' })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search links' }), { target: { value: 'blo' } })

    expect(screen.getByRole('heading', { name: 'blog' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'docs' })).not.toBeInTheDocument()

    const search = screen.getByRole('searchbox', { name: 'Search links' })
    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getByRole('heading', { name: 'blog' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'docs' })).toBeInTheDocument()
    expect(search).toHaveValue('')
  })

  it('filters links by destination URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([
      link,
      { alias: 'blog', url: 'https://news.example/articles', usageCount: 2 },
    ])))
    render(<App />)
    await screen.findByRole('heading', { name: 'docs' })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search links' }), { target: { value: 'news.example' } })

    expect(screen.getByRole('heading', { name: 'blog' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'docs' })).not.toBeInTheDocument()
  })

  it('matches alias and destination queries without case sensitivity', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([link])))
    render(<App />)
    await screen.findByRole('heading', { name: 'docs' })
    const search = screen.getByRole('searchbox', { name: 'Search links' })

    fireEvent.change(search, { target: { value: 'DOCS' } })
    expect(screen.getByRole('heading', { name: 'docs' })).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'EXAMPLE.COM/DOCS' } })
    expect(screen.getByRole('heading', { name: 'docs' })).toBeInTheDocument()
  })

  it('shows a no-match state with a clear action and restores all links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([
      link,
      { alias: 'blog', url: 'https://example.com/articles', usageCount: 2 },
    ])))
    render(<App />)
    await screen.findByRole('heading', { name: 'docs' })
    const search = screen.getByRole('searchbox', { name: 'Search links' })
    fireEvent.change(search, { target: { value: 'missing' } })

    expect(screen.getByText('No links match “missing”.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'docs' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByRole('heading', { name: 'docs' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'blog' })).toBeInTheDocument()
    expect(search).toHaveValue('')
  })

  it('keeps the active filter when creating a link and includes a matching result', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([link]))
      .mockResolvedValueOnce(jsonResponse({ alias: 'new-docs', url: 'https://example.com/new', usageCount: 0 }, 201))
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await screen.findByRole('heading', { name: 'docs' })
    const search = screen.getByRole('searchbox', { name: 'Search links' })
    fireEvent.change(search, { target: { value: 'new-docs' } })
    expect(screen.getByText('No links match “new-docs”.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Destination URL'), { target: { value: 'https://example.com/new' } })
    fireEvent.change(screen.getByLabelText(/Custom alias/), { target: { value: 'new-docs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create short link' }))

    expect(await screen.findByRole('heading', { name: 'new-docs' })).toBeInTheDocument()
    expect(search).toHaveValue('new-docs')
    expect(screen.queryByRole('heading', { name: 'docs' })).not.toBeInTheDocument()
  })

  it('keeps the active filter after deleting a matching link', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([
        link,
        { alias: 'blog', url: 'https://example.com/articles', usageCount: 2 },
      ]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    render(<App />)
    await screen.findByRole('heading', { name: 'docs' })
    const search = screen.getByRole('searchbox', { name: 'Search links' })
    fireEvent.change(search, { target: { value: 'docs' } })
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('No links match “docs”.')).toBeInTheDocument()
    expect(search).toHaveValue('docs')
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByRole('heading', { name: 'blog' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'docs' })).not.toBeInTheDocument()
  })
})
