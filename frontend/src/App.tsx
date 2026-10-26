import { useEffect, useState, type FormEvent } from 'react'
import './App.css'

type Link = {
  alias: string
  url: string
  usageCount: number
}

function isLink(value: unknown): value is Link {
  return (
    typeof value === 'object' &&
    value !== null &&
    'alias' in value &&
    typeof value.alias === 'string' &&
    'url' in value &&
    typeof value.url === 'string' &&
    'usageCount' in value &&
    typeof value.usageCount === 'number'
  )
}

function copyWithFallback(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    return document.execCommand('copy')
  } finally {
    textarea.remove()
  }
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
    ) {
      return body.error
    }
  } catch {
    // The response may not include a JSON error body.
  }
  return fallback
}

function App() {
  const [links, setLinks] = useState<Link[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [reloadCount, setReloadCount] = useState(0)
  const [destination, setDestination] = useState('')
  const [alias, setAlias] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredLinks = normalizedQuery
    ? links.filter((link) =>
        link.alias.toLowerCase().includes(normalizedQuery) || link.url.toLowerCase().includes(normalizedQuery),
      )
    : links

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setListError('')

    async function loadLinks() {
      try {
        const response = await fetch('/api/links', { signal: controller.signal })
        if (!response.ok) {
          throw new Error(await responseError(response, 'Unable to load links. Please try again.'))
        }
        const data: unknown = await response.json()
        if (!Array.isArray(data) || !data.every(isLink)) {
          throw new Error('The server returned an invalid list of links.')
        }
        setLinks(data)
      } catch (error) {
        if (!controller.signal.aborted) {
          setListError(error instanceof Error ? error.message : 'Unable to load links.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadLinks()
    return () => controller.abort()
  }, [reloadCount])

  async function createLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading || listError) return
    setActionError('')
    setFeedback('')
    setSaving(true)

    const payload: { url: string; alias?: string } = { url: destination.trim() }
    if (alias.trim()) payload.alias = alias.trim()

    try {
      const response = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error(await responseError(response, 'Unable to create link. Please try again.'))
      }
      const created: unknown = await response.json()
      if (!isLink(created)) throw new Error('The server returned an invalid link.')
      setLinks((current) => [created, ...current])
      setDestination('')
      setAlias('')
      setFeedback(`Short link created: ${window.location.origin}/${encodeURIComponent(created.alias)}`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to create link.')
    } finally {
      setSaving(false)
    }
  }

  async function copyLink(link: Link) {
    setActionError('')
    setFeedback('')
    const shortUrl = `${window.location.origin}/${encodeURIComponent(link.alias)}`
    try {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
        await navigator.clipboard.writeText(shortUrl)
      } catch {
        if (!copyWithFallback(shortUrl)) throw new Error('Clipboard copy failed')
      }
      setFeedback(`Copied ${shortUrl} to clipboard.`)
    } catch {
      setActionError('Unable to copy the short link. Check your browser clipboard permissions.')
    }
  }

  async function deleteLink(link: Link) {
    if (!window.confirm(`Delete the short link “${link.alias}”? This cannot be undone.`)) return

    setActionError('')
    setFeedback('')
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(link.alias)}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error(await responseError(response, 'Unable to delete link. Please try again.'))
      }
      setLinks((current) => current.filter((item) => item.alias !== link.alias))
      setFeedback(`Deleted short link “${link.alias}”.`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to delete link.')
    }
  }

  return (
    <main className="dashboard">
      <header className="page-header">
        <p className="eyebrow">MULTI-AGENT PLAYGROUND</p>
        <h1>Link dashboard</h1>
        <p className="intro">Create and manage short links on your network.</p>
      </header>

      <section className="panel create-panel" aria-labelledby="create-heading">
        <h2 id="create-heading">Create a short link</h2>
        <form onSubmit={createLink}>
          <div className="form-fields">
            <label className="field destination-field">
              <span>Destination URL</span>
              <input
                type="url"
                name="url"
                placeholder="https://example.com/page"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Custom alias <span className="optional">(optional)</span></span>
              <input
                type="text"
                name="alias"
                placeholder="Leave blank to generate"
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
                pattern="[A-Za-z0-9_-]+"
                title="Use letters, numbers, hyphens, or underscores."
              />
            </label>
          </div>
          <button className="primary-button" type="submit" disabled={saving || loading || Boolean(listError)}>
            {saving ? 'Creating…' : 'Create short link'}
          </button>
        </form>
      </section>

      {actionError && <p className="message error" role="alert">{actionError}</p>}
      {feedback && <p className="message success" role="status">{feedback}</p>}

      <section className="links-section" aria-labelledby="links-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR LINKS</p>
            <h2 id="links-heading">Manage links</h2>
          </div>
          {!loading && !listError && <span className="link-count">{links.length} total</span>}
        </div>

        {loading && <p className="panel state-message" role="status">Loading your links…</p>}
        {!loading && !listError && (
          <div className="search-controls">
            <label className="search-field">
              <span>Search links</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by alias or destination URL"
              />
            </label>
            {searchQuery && (filteredLinks.length > 0 || links.length === 0) && (
              <button className="secondary-button" type="button" onClick={() => setSearchQuery('')}>
                Clear search
              </button>
            )}
          </div>
        )}
        {!loading && listError && (
          <>
            <p className="panel message error" role="alert">{listError}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setReloadCount((count) => count + 1)}
            >
              Retry
            </button>
          </>
        )}
        {!loading && !listError && links.length === 0 && (
          <p className="panel state-message">No links yet. Create one above to get started.</p>
        )}
        {!loading && !listError && links.length > 0 && filteredLinks.length === 0 && (
          <div className="panel state-message no-match-state">
            <p>No links match “{searchQuery.trim()}”.</p>
            <button className="secondary-button" type="button" onClick={() => setSearchQuery('')}>
              Clear search
            </button>
          </div>
        )}
        {!loading && !listError && filteredLinks.length > 0 && (
          <ul className="link-list">
            {filteredLinks.map((link) => {
              const shortUrl = `${window.location.origin}/${encodeURIComponent(link.alias)}`
              return (
                <li className="panel link-card" key={link.alias}>
                  <div className="link-main">
                    <div className="link-title-row">
                      <h3>{link.alias}</h3>
                      <span className="usage-count">
                        {link.usageCount} {link.usageCount === 1 ? 'visit' : 'visits'}
                      </span>
                    </div>
                    <a className="short-url" href={shortUrl}>{shortUrl}</a>
                    <a className="destination-url" href={link.url} target="_blank" rel="noreferrer">
                      {link.url}
                    </a>
                  </div>
                  <div className="link-actions">
                    <button type="button" className="secondary-button" onClick={() => void copyLink(link)}>
                      Copy
                    </button>
                    <button type="button" className="delete-button" onClick={() => void deleteLink(link)}>
                      Delete
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}

export default App
