# Multi-Agent Playground

A personal hobby project for experimenting with multi-agent AI software
development. The application is a small URL shortener, built on a minimal
frontend/backend foundation.

## Stack and structure

TypeScript throughout, React with Vite, Node.js with Express, and npm workspaces.
Frontend tests use Vitest and Testing Library; backend tests use Node's test runner.

```text
AGENTS.md                       Shared engineering and collaboration principles
.github/copilot-instructions.md  Concise Copilot guidance
package.json / package-lock.json Workspace commands and single dependency lockfile
tsconfig.base.json              Shared TypeScript checks
frontend/                      React page, Vite proxy and UI tests
backend/                       Express health/link API and HTTP tests
```

## Prerequisites and installation

- Node.js 24 LTS (24.15 or newer in the 24.x series; `.nvmrc` selects 24).
- npm 11 or newer.
- Git.

From the repository root:

```sh
npm install
npm run dev
```

Open <http://localhost:5173> (or the URL Vite prints if that port is occupied).
The page displays loading, backend health, or an actionable error message.

## Commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies for both workspaces |
| `npm run dev` | Run both development servers; Ctrl+C stops both |
| `npm run build` | Build both workspaces into their respective `dist/` folders |
| `npm run typecheck` | Type-check application, configuration and test code |
| `npm test` | Run all automated tests once |

Workspaces also run independently:

```sh
npm run dev --workspace frontend
npm run dev --workspace backend
```

Both accept `npm run build --workspace <name>`,
`npm run typecheck --workspace <name>` and `npm test --workspace <name>`.
After building, `npm start --workspace backend` runs the compiled backend;
`npm run preview --workspace frontend` previews the static frontend build.

## Frontend/backend communication

Express listens on `127.0.0.1:3001` by default.
`GET /api/health` returns HTTP 200 with:

```json
{ "status": "ok", "service": "backend" }
```

`POST /api/links` creates a link from a JSON body containing a `url` and an
optional `alias`:

```json
{ "url": "https://example.com/somewhere", "alias": "my-link" }
```

Aliases may contain ASCII letters, digits, hyphens and underscores; they are
case-sensitive. If omitted, an alias is generated. The endpoint returns HTTP 201
with the alias, URL and initial `usageCount` of `0`; invalid input returns 400,
and duplicate custom aliases return 409. The reserved aliases `api`, `health`
and `links` cannot be used.

Links are stored in SQLite at `data/links.sqlite` relative to the backend's
working directory. Set `LINKS_DATABASE_PATH` to override the database file path.

The frontend fetches the relative URL `/api/health`. Vite's **development**
proxy forwards `/api` to Express, so no CORS setup is needed. Requests time out
after five seconds and failures are shown on the page.

Set `PORT` to change the backend port. The Vite development proxy reads the same
variable; supply it to both processes (for example, `PORT=4001 npm run dev` in a
POSIX shell). Valid ports are integers from 1 to 65535.

```sh
curl http://127.0.0.1:3001/api/health
curl http://localhost:5173/api/health
```

The proxy is development-only. Static preview does not proxy API requests;
serving a built frontend with a backend would require same-origin `/api` routing.
Deployment infrastructure is intentionally outside this scaffold.

## Future agent experiment

A later phase will add six OpenCode specialists: Coordinator, Architect, React
Specialist, Node.js Specialist, Code Reviewer and Tester, using native delegation.
No agent definitions or custom orchestration are included now.

See `AGENTS.md` for the project's minimal engineering conventions.
