# Multi-Agent Playground

A personal hobby project for experimenting with multi-agent AI software
development using OpenCode's native delegation capabilities.

The application is a **LAN-only URL shortener**, providing a useful home-network
tool while giving a team of specialised AI agents real development tasks.

The project explores whether selective agent delegation produces maintainable,
correct software without unnecessary coordination or engineering complexity.

## Project status

**Foundation complete; URL-shortener implementation pending.**

The repository currently provides a working React/Vite frontend, Node.js/Express
backend, TypeScript configuration, npm workspaces, health endpoint and tests.

URL creation, redirects, usage counters, SQLite persistence, the management
interface and Docker deployment are planned features, not yet implemented.

## Planned functionality

The initial release will support:

- Creating shortened links with automatically generated aliases.
- Creating shortened links with custom aliases.
- Validating HTTP and HTTPS destination URLs.
- Redirecting short links using HTTP 302.
- Counting successful redirect requests.
- Listing stored links, destinations and usage counts.
- Copying short links.
- Deleting links with confirmation.
- Persisting links and counters across restarts.

Aliases will be case-sensitive and support letters, digits, hyphens and
underscores.

The initial release will not include authentication, public internet hosting,
link expiry, editing existing links, QR codes or detailed visitor analytics.

## Stack and structure

TypeScript throughout, React with Vite, Node.js with Express, and npm workspaces.

Frontend tests use Vitest and Testing Library; backend tests use Node's
built-in test runner.

SQLite is planned for persistence, with Docker Compose used for deployment.

```text
AGENTS.md                       Shared engineering and collaboration principles
.github/copilot-instructions.md  Concise Copilot guidance
.opencode/agents/               OpenCode Coordinator and specialist definitions
opencode.jsonc                  Project-local OpenCode configuration
package.json / package-lock.json Workspace commands and single dependency lockfile
tsconfig.base.json              Shared TypeScript checks
frontend/                       React page, Vite proxy and UI tests
backend/                        Express health API and HTTP test
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

The current scaffold page displays loading, backend health, or an actionable
error message. It will be replaced by the URL-shortener management interface
during implementation.

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

Express currently listens on `127.0.0.1:3001` by default.

`GET /api/health` returns HTTP 200 with:

```json
{ "status": "ok", "service": "backend" }
```

The frontend fetches the relative URL `/api/health`.

Vite's **development** proxy forwards `/api` to Express, so no CORS setup is
needed. Requests time out after five seconds and failures are shown on the page.

Set `PORT` to change the backend port. The Vite development proxy reads the
same variable; supply it to both processes (for example,
`PORT=4001 npm run dev` in a POSIX shell).

Valid ports are integers from 1 to 65535.

```sh
curl http://127.0.0.1:3001/api/health
curl http://localhost:5173/api/health
```

The proxy is development-only. Static preview does not proxy API requests.

Production serving will be updated to provide the compiled frontend, API
and redirects from the same Express origin.

The backend's current localhost-only binding will also need to be made
configurable for Docker deployment.

## Planned HTTP API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Existing health endpoint |
| `POST` | `/api/links` | Create a shortened link |
| `GET` | `/api/links` | List links and usage counts |
| `DELETE` | `/api/links/:alias` | Delete a link |
| `GET` | `/:alias` | Redirect and increment usage count |

The URL-shortener endpoints are planned and are not yet available.

## Development and deployment

Development takes place on **Charon**, using WSL Ubuntu.

Deployment targets a **Raspberry Pi 5** running Linux ARM64 and Docker.

The intended production arrangement is:

- One Docker Compose application service.
- One HTTP origin for the frontend, API and redirects.
- SQLite storage persisted outside the container.
- SQLite data preferably stored on the Pi's local SSD.
- A configurable published port and short-link base URL.
- An application health check and appropriate restart policy.
- LAN-only access, without public internet exposure.

Docker packaging and deployment instructions will be added when implemented
and verified.

## Multi-agent experiment

The project has seven OpenCode agents:

| Agent | Responsibility |
| --- | --- |
| Coordinator | Overall task execution and selective delegation |
| Architect | Architecture and design trade-offs |
| React Specialist | Frontend implementation |
| Node.js Specialist | Backend implementation |
| Docker Specialist | Containerisation and deployment preparation |
| Code Reviewer | Independent review |
| Tester | Testing and verification |

The agents are defined under `.opencode/agents/`.

The Coordinator decides which specialists to involve based on the actual task.

The experiment evaluates:

- Appropriate delegation decisions.
- Clear task boundaries.
- Scope adherence.
- Integration of specialist contributions.
- Quality of code review.
- Evidence from tests and verification.
- Avoidance of unnecessary handoffs and complexity.

The objective is effective collaboration, not maximising agent activity.

## Implementation milestones

### 1. Link creation and persistence

Implement SQLite storage, generated and custom aliases, input validation
and the link-creation API.

### 2. Redirects and usage counters

Implement alias resolution, HTTP 302 redirects, usage counters and
HTTP 404 handling.

### 3. Management interface

Implement the React interface for creating, listing, copying and deleting
shortened links.

### 4. Integration and deployment

Complete integration verification, Docker packaging, ARM64 compatibility
checks, persistent storage and Raspberry Pi deployment.

Milestones are planning boundaries, not mandatory agent workflows.

## Engineering principles

Keep the application straightforward, maintainable and appropriate to a
personal home-lab project.

Preserve correctness, readable code, meaningful tests, data integrity and
sensible error handling.

Avoid unnecessary frameworks, infrastructure and abstractions.

See [AGENTS.md](AGENTS.md) for the shared engineering and agent collaboration
instructions.
