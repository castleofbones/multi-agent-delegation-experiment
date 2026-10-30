import { useEffect, useState, type FormEvent } from 'react'
import './App.css'

type Link = {
  alias: string
  url: string
  usageCount: number
  tags: string[]
}

type LinkPayload = Omit<Link, 'tags'> & { tags?: unknown }

function isLink(value: unknown): value is LinkPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'alias' in value &&
    typeof value.alias === 'string' &&
    'url' in value &&
    typeof value.url === 'string' &&
    'usageCount' in value &&
    typeof value.usageCount === 'number' &&
    (!('tags' in value) || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string')))
  )
}

function normalizeLink(link: LinkPayload, fallbackTags: string[] = []): Link {
  return { ...link, tags: Array.isArray(link.tags) ? link.tags as string[] : fallbackTags }
}

function isTaggedLink(value: unknown, alias: string): value is { alias: string; tags: string[] } {
  return (
    typeof value === 'object' && value !== null &&
    'alias' in value && value.alias === alias &&
    'tags' in value && Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string')
  )
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  } catch {
    return false
  }
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
  const [editingAlias, setEditingAlias] = useState<string | null>(null)
  const [editDestination, setEditDestination] = useState('')
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({})
  const [tagErrors, setTagErrors] = useState<Record<string, string>>({})
  const [savingTagAliases, setSavingTagAliases] = useState<Record<string, boolean>>({})
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const availableTags = [...new Set(links.flatMap((link) => link.tags))].sort((a, b) => a.localeCompare(b))
  const filteredLinks = links.filter((link) => {
    const matchesQuery = !normalizedQuery ||
      link.alias.toLowerCase().includes(normalizedQuery) ||
      link.url.toLowerCase().includes(normalizedQuery)
    return matchesQuery && (!selectedTag || link.tags.includes(selectedTag))
  })

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
        setLinks(data.map((item) => normalizeLink(item)))
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
      setLinks((current) => [normalizeLink(created), ...current])
      setDestination('')
      setAlias('')
      setFeedback(`Short link created: ${window.location.origin}/${encodeURIComponent(created.alias)}`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to create link.')
    } finally {
      setSaving(false)
    }
  }

  function startEditing(link: Link) {
    setEditingAlias(link.alias)
    setEditDestination(link.url)
    setEditError('')
    setActionError('')
    setFeedback('')
  }

  function cancelEditing() {
    setEditingAlias(null)
    setEditDestination('')
    setEditError('')
    setSavingEdit(false)
  }

  async function saveDestination(event: FormEvent<HTMLFormElement>, link: Link) {
    event.preventDefault()
    const url = editDestination.trim()
    if (!isHttpUrl(url)) {
      setEditError('Enter a valid absolute HTTP or HTTPS URL.')
      return
    }

    setEditError('')
    setSavingEdit(true)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(link.alias)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!response.ok) {
        throw new Error(await responseError(response, 'Unable to update destination. Please try again.'))
      }
      const updated: unknown = await response.json()
      if (!isLink(updated) || updated.alias !== link.alias) {
        throw new Error('The server returned an invalid link.')
      }
      setLinks((current) => current.map((item) => item.alias === link.alias ? normalizeLink(updated, item.tags) : item))
      setEditingAlias(null)
      setEditDestination('')
      setFeedback(`Updated destination for “${link.alias}”.`)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Unable to update destination.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function addTag(event: FormEvent<HTMLFormElement>, link: Link) {
    event.preventDefault()
    const tag = tagInputs[link.alias] ?? ''
    if (!tag.trim() || savingTagAliases[link.alias]) return

    setTagErrors((current) => ({ ...current, [link.alias]: '' }))
    setSavingTagAliases((current) => ({ ...current, [link.alias]: true }))
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(link.alias)}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      })
      if (!response.ok) {
        throw new Error(await responseError(response, 'Unable to add tag. Please try again.'))
      }
      const result: unknown = await response.json()
      if (!isTaggedLink(result, link.alias)) throw new Error('The server returned invalid tags.')
      const addedTags = result.tags.filter((resultTag) => !link.tags.includes(resultTag))
      setLinks((current) => current.map((item) => item.alias === link.alias
        ? { ...item, tags: [...new Set([...item.tags, ...addedTags])] }
        : item,
      ))
      setTagInputs((current) => ({ ...current, [link.alias]: '' }))
    } catch (error) {
      setTagErrors((current) => ({
        ...current,
        [link.alias]: error instanceof Error ? error.message : 'Unable to add tag.',
      }))
    } finally {
      setSavingTagAliases((current) => ({ ...current, [link.alias]: false }))
    }
  }

  async function removeTag(link: Link, tag: string) {
    if (savingTagAliases[link.alias]) return
    setTagErrors((current) => ({ ...current, [link.alias]: '' }))
    setSavingTagAliases((current) => ({ ...current, [link.alias]: true }))
    try {
      const response = await fetch(
        `/api/links/${encodeURIComponent(link.alias)}/tags/${encodeURIComponent(tag)}`,
        { method: 'DELETE' },
      )
      if (!response.ok) {
        throw new Error(await responseError(response, 'Unable to remove tag. Please try again.'))
      }
      setLinks((current) => current.map((item) =>
        item.alias === link.alias ? { ...item, tags: item.tags.filter((itemTag) => itemTag !== tag) } : item,
      ))
    } catch (error) {
      setTagErrors((current) => ({
        ...current,
        [link.alias]: error instanceof Error ? error.message : 'Unable to remove tag.',
      }))
    } finally {
      setSavingTagAliases((current) => ({ ...current, [link.alias]: false }))
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
        {!loading && !listError && (availableTags.length > 0 || selectedTag) && (
          <div className="tag-filters" role="group" aria-label="Filter links by tag">
            <span>Tags:</span>
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`tag-filter${selectedTag === tag ? ' selected' : ''}`}
                aria-pressed={selectedTag === tag}
                onClick={() => setSelectedTag((current) => current === tag ? null : tag)}
              >
                {tag}
              </button>
            ))}
            {selectedTag && (
              <button className="secondary-button" type="button" onClick={() => setSelectedTag(null)}>
                Clear tag filter
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
            <p>
              {selectedTag && normalizedQuery
                ? `No links match “${searchQuery.trim()}” with the “${selectedTag}” tag.`
                : selectedTag
                  ? `No links have the “${selectedTag}” tag.`
                  : `No links match “${searchQuery.trim()}”.`}
            </p>
            {selectedTag && (
              <button className="secondary-button" type="button" onClick={() => setSelectedTag(null)}>
                Clear tag filter
              </button>
            )}
            {normalizedQuery && (
              <button className="secondary-button" type="button" onClick={() => setSearchQuery('')}>
                Clear search
              </button>
            )}
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
                    {editingAlias === link.alias ? (
                      <form className="edit-destination-form" onSubmit={(event) => void saveDestination(event, link)} noValidate>
                        <label className="field">
                          <span>Destination URL for {link.alias}</span>
                          <input
                            type="url"
                            value={editDestination}
                            onChange={(event) => setEditDestination(event.target.value)}
                            aria-describedby={editError ? `edit-error-${encodeURIComponent(link.alias)}` : undefined}
                            required
                          />
                        </label>
                        {editError && <p className="message error edit-error" id={`edit-error-${encodeURIComponent(link.alias)}`} role="alert">{editError}</p>}
                        <div className="link-actions edit-actions">
                          <button type="submit" className="primary-button" disabled={savingEdit}>
                            {savingEdit ? 'Saving…' : 'Save destination'}
                          </button>
                          <button type="button" className="secondary-button" onClick={cancelEditing} disabled={savingEdit}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <a className="destination-url" href={link.url} target="_blank" rel="noreferrer">
                        {link.url}
                      </a>
                    )}
                    <div className="link-tags" role="group" aria-label={`Tags for ${link.alias}`}>
                      {link.tags.map((tag) => (
                        <span className="tag-chip" key={tag}>
                          <span>{tag}</span>
                          <button
                            type="button"
                            aria-label={`Remove tag ${tag} from ${link.alias}`}
                            onClick={() => void removeTag(link, tag)}
                            disabled={Boolean(savingTagAliases[link.alias])}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <form className="add-tag-form" onSubmit={(event) => void addTag(event, link)}>
                      <label className="field">
                        <span>Add tag to {link.alias}</span>
                        <input
                          type="text"
                          value={tagInputs[link.alias] ?? ''}
                          onChange={(event) => setTagInputs((current) => ({ ...current, [link.alias]: event.target.value }))}
                          disabled={Boolean(savingTagAliases[link.alias])}
                        />
                      </label>
                      <button className="secondary-button" type="submit" disabled={Boolean(savingTagAliases[link.alias]) || !(tagInputs[link.alias] ?? '').trim()}>
                        {savingTagAliases[link.alias] ? 'Saving…' : 'Add tag'}
                      </button>
                    </form>
                    {tagErrors[link.alias] && <p className="message error tag-error" role="alert">{tagErrors[link.alias]}</p>}
                  </div>
                  <div className="link-actions">
                    <button type="button" className="secondary-button" onClick={() => void copyLink(link)}>
                      Copy
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => startEditing(link)}
                      disabled={editingAlias === link.alias}
                    >
                      Edit destination
                    </button>
                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => void deleteLink(link)}
                      disabled={editingAlias === link.alias}
                    >
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
