# Multi-Agent Playground

A personal hobby project for experimenting with multi-agent AI software
development using OpenCode's native delegation capabilities.

The application is a **LAN-only URL shortener**, providing a useful home-network
tool while giving a team of specialised AI agents real development tasks.

The project explores whether selective agent delegation produces maintainable,
correct software without unnecessary coordination or engineering complexity.

## Project status

**URL shortener implemented; Docker packaging is prepared and awaiting container verification.**

The repository provides a React/Vite frontend, Node.js/Express backend,
TypeScript configuration, npm workspaces, SQLite persistence, URL management
API/UI, health endpoint, tests and a single-container Docker Compose deployment.

## Functionality

The application supports:

- Creating shortened links with automatically generated aliases.
- Creating shortened links with custom aliases.
- Validating HTTP and HTTPS destination URLs.
- Redirecting short links using HTTP 302.
- Counting successful redirect requests.
- Listing stored links, destinations and usage counts.
- Copying short links.
- Deleting links with confirmation.
- Persisting links and counters across restarts.

Aliases are case-sensitive and support letters, digits, hyphens and
underscores.

The initial release will not include authentication, public internet hosting,
link expiry, editing existing links, QR codes or detailed visitor analytics.

## Stack and structure

TypeScript throughout, React with Vite, Node.js with Express, and npm workspaces.

Frontend tests use Vitest and Testing Library; backend tests use Node's
built-in test runner.

SQLite persists links and usage counts; Docker Compose provides the single-container deployment.

```text
AGENTS.md                       Shared engineering and collaboration principles
.github/copilot-instructions.md  Concise Copilot guidance
.opencode/agents/               OpenCode Coordinator and specialist definitions
opencode.jsonc                  Project-local OpenCode configuration
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

The development frontend provides the short-link creation and management
interface; production serves the same built frontend and API from Express.

## Commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies for both workspaces |
| `npm run dev` | Run both development servers; Ctrl+C stops both |
| `npm run build` | Build both workspaces into their respective `dist/` folders |
| `npm run typecheck` | Type-check application, configuration and test code |
| `npm test` | Run all automated tests once |
| `npm run test:e2e` | Build the app and run the isolated browser end-to-end test |

The E2E test requires a compatible Chromium executable in the Playwright browser
cache or installed on the system; `npm install` does not download a browser. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to select a specific executable:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

The suite starts its own loopback-only app and destination servers and uses a
throwaway SQLite database.

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

The frontend uses relative `/api` requests. Vite's **development** proxy forwards
API and short-link requests to Express, so no CORS setup is needed. Production
serves the compiled frontend and API from the same Express origin.

Set `PORT` to change the backend port. The Vite development proxy reads the
same variable; supply it to both processes (for example,
`PORT=4001 npm run dev` in a POSIX shell).

Valid ports are integers from 1 to 65535.

```sh
curl http://127.0.0.1:3001/api/health
curl http://localhost:5173/api/health
```

The proxy is development-only. Static preview does not proxy API requests.

Set `HOST` to change the backend bind address; Docker sets it to `0.0.0.0` so
the service can receive traffic through its published container port.

## HTTP API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Existing health endpoint |
| `POST` | `/api/links` | Create a shortened link |
| `GET` | `/api/links` | List links and usage counts |
| `DELETE` | `/api/links/:alias` | Delete a link |
| `GET` | `/:alias` | Redirect and increment usage count |

The URL-shortener endpoints are available; successful redirects use HTTP 302,
and unknown aliases return 404.

## Development and deployment

Development takes place on **Charon**, using WSL Ubuntu.

Deployment targets a **Raspberry Pi 5** running Linux ARM64 and Docker.

The production arrangement uses one Docker Compose application container for
Express, the compiled frontend, API and short-link redirects. The image uses
Node.js 24 (including the official ARM64-compatible Debian slim image), installs
backend production dependencies only, and runs as the non-root `node` user.

### Build and run with Docker Compose

Docker Engine and the Compose plugin are required. From a checkout on the Pi,
create a local `.env` file in the repository root (it is git-ignored):

```dotenv
# Use the Pi's LAN address, ideally one reserved in the router. Do not use 0.0.0.0.
LAN_BIND_ADDRESS=192.168.1.20
PORT=3001
# A directory on the Pi's local SSD, outside this checkout.
DATA_DIR=/mnt/ssd/multi-agent-playground
```

Use the actual LAN address and SSD mount path for your Pi. The bind address is
required by Compose, so Docker cannot silently publish the service on every host
interface. A LAN bind does not replace appropriate host/router firewall rules;
do not forward this port from the internet.

The container listens on `PORT` (default `3001`) and binds to
`0.0.0.0` inside the container. Compose publishes that port only on
`LAN_BIND_ADDRESS`. Open the app using that LAN address and port; the frontend
uses the current site origin when displaying and copying short links. The app
also receives `LINKS_DATABASE_PATH=/data/links.sqlite` by default. You can
override it, but keep the database file under `/data` so it remains on the
persistent SSD mount.

Prepare the persistent directory for the image's `node` user (UID 1000 in the
official Node image), then build and start the service:

```sh
sudo mkdir -p /mnt/ssd/multi-agent-playground
sudo chown 1000:1000 /mnt/ssd/multi-agent-playground
docker compose up -d --build
docker compose ps
```

The SQLite file is stored at
`$DATA_DIR/links.sqlite` on the host and mounted at `/data` in the container.
It survives container replacement and image updates. Keep this directory on a
local SSD filesystem rather than a network share. Back it up before upgrades
or other maintenance that could affect the host storage.

Check health and access from a LAN client:

```sh
docker compose logs app
curl http://192.168.1.20:3001/api/health
```

The image health check calls `/api/health`; Compose restarts the service unless
it is explicitly stopped. To update after pulling changes, run
`docker compose up -d --build` again. `docker compose down` removes the
container but leaves the host data directory intact.

### Portainer deployment

For Portainer, create a Stack from the Git repository (or use a Pi-local
checkout), set the Compose file path to `docker-compose.yml`, and provide the
same three variables (`LAN_BIND_ADDRESS`, `PORT`, and `DATA_DIR`) in the
stack's environment-variable settings. The Git/checkout
context must include the Dockerfile and both workspaces so Portainer can build
the image on the Pi. Create the SSD data directory and assign it to UID 1000
as above before deploying. Review the published binding and volume path in the
stack before starting it.

Using a native build on the Raspberry Pi builds the Node dependencies and
application for its ARM64 architecture; no cross-compilation or external image
registry is needed. Docker/Compose are not required for normal development.

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
