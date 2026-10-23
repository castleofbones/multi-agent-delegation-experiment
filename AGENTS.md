# Project principles

## Context

Multi-Agent Playground is a personal engineering experiment in collaborative
AI software development using OpenCode's native agent delegation.

The application is a LAN-only URL shortener, intended to be genuinely useful
while providing real implementation tasks for the agent team.

The project has two goals:

1. Build a small, reliable and maintainable URL shortener.
2. Evaluate how effectively specialised AI agents collaborate on real tasks.

This is a personal hobbyist and home-lab project, not enterprise production
software.

## Engineering philosophy

- Prefer simple, readable and maintainable solutions.
- Follow existing project conventions.
- Reuse existing functionality before adding abstractions.
- Keep changes focused.
- Avoid speculative engineering.
- Preserve correctness and sensible failure handling.
- Apply security practices appropriate to actual risks.
- Prefer established platform capabilities.
- Avoid unnecessary dependencies.
- Use TypeScript consistently.
- Validate untrusted input at boundaries.
- Handle errors explicitly.
- Do not swallow exceptions silently.
- Comments should explain why, not merely describe what.
- Avoid introducing interfaces or layers without demonstrated value.
- Preserve data integrity and use appropriate automated tests.

Complexity must be justified by an actual requirement.

## Technology and environments

The existing application uses:

- React, Vite and TypeScript for the frontend.
- Node.js, Express and TypeScript for the backend.
- npm workspaces with a shared dependency lockfile.
- Vitest and Testing Library for frontend tests.
- Node's built-in test runner for backend tests.
- An existing `GET /api/health` endpoint.

The URL shortener will introduce SQLite persistence.

Development takes place on Charon using WSL Ubuntu.

Deployment targets a Raspberry Pi 5 running Linux ARM64, using Docker Compose.

Preserve existing project scripts, structure and conventions unless there is
a demonstrated reason to change them.

## URL shortener requirements

### Link creation

Users must be able to create a short link by supplying:

- A destination URL.
- An optional custom alias.

When no alias is supplied, generate a unique alias automatically.

Accept only absolute HTTP and HTTPS destination URLs.

Use established URL parsing facilities for validation.

Aliases are case-sensitive and may contain ASCII letters, digits, hyphens
and underscores.

Reject empty custom aliases, invalid aliases and reserved application paths.

Reserve `api` and any additional top-level paths required by the application.

Reject duplicate aliases rather than overwriting existing links.

Generated aliases must handle collisions safely.

### Redirection and usage counts

`GET /:alias` must resolve the exact alias and issue HTTP 302 with the stored
destination in the `Location` header.

Use HTTP 302 rather than a permanent redirect to avoid persistent browser
caching interfering with usage counts.

Each successful redirect request must increment the stored usage counter.

Usage counts represent redirect requests, not unique visitors.

Use an atomic database update so concurrent requests cannot lose increments.

Unknown or deleted aliases must return HTTP 404 and must not increment counts.

### Link management

Provide a responsive React interface supporting:

- Creating links with generated or custom aliases.
- Displaying full short URLs.
- Copying short URLs.
- Listing aliases and destination URLs.
- Displaying usage counts.
- Deleting links with confirmation.

Provide appropriate loading, empty and error states.

Aliases and destinations are immutable in the initial release. Editing is
out of scope; users may delete and recreate links.

### Persistence

Persist each link's alias, destination URL and usage count in SQLite.

Enforce alias uniqueness at the database level.

Data must survive application and container restarts.

Keep persistence straightforward. Do not introduce a separate database server
or unnecessary persistence abstractions.

In production, store SQLite data outside the container filesystem, preferably
on the Raspberry Pi's local SSD.

## Planned HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Existing health endpoint |
| `POST` | `/api/links` | Create a link |
| `GET` | `/api/links` | List links and usage counts |
| `DELETE` | `/api/links/:alias` | Delete a link |
| `GET` | `/:alias` | Redirect and increment usage count |

Use appropriate HTTP status codes and meaningful error responses.

In particular:

- HTTP 400 for invalid creation input.
- HTTP 409 for duplicate aliases.
- HTTP 404 for unknown aliases.
- HTTP 302 for successful redirects.

Keep JSON API error responses consistent.

Do not introduce additional endpoints without a demonstrated requirement.

## Routing and deployment

The intended production deployment is one application container serving
the React frontend, Express API and short-link redirects from one origin.

The existing Vite proxy remains a development-only facility.

Express must serve compiled frontend assets in production and listen on
an address reachable through Docker's published port.

Route ordering must prevent short-link aliases from intercepting API routes
or frontend assets.

Use a configurable application port and short-link base URL.

The application is intended for trusted LAN access only.

Do not configure public internet exposure. Do not assume that publishing a
Docker port automatically restricts access to the LAN.

Use maintained ARM64-compatible container images.

Use Docker Compose, persistent SQLite storage, an appropriate health check
and a sensible restart policy.

Do not introduce a separate frontend container, reverse proxy, Kubernetes
or additional deployment services without a demonstrated requirement.

## Agent collaboration

The project has seven OpenCode agents:

- Coordinator
- Architect
- React Specialist
- Node.js Specialist
- Docker Specialist
- Code Reviewer
- Tester

Their definitions are maintained under `.opencode/agents/`.

Use OpenCode's native delegation capabilities.

Do not build custom agent orchestration infrastructure.

The Coordinator is responsible for selecting relevant specialists, integrating
contributions and verifying the overall result.

The Coordinator should invoke only specialists relevant to the task.

Do not invoke every specialist automatically or create unnecessary handoffs.

The Architect should prefer the simplest design satisfying current requirements
and recognise that "no architectural change required" is a valid recommendation.

The Docker Specialist handles containerisation and deployment preparation,
not independently authorised production deployment.

Independent review and testing should be proportionate to the risks and
complexity of the change.

## Working practices

Before changing code:

1. Inspect the relevant existing implementation.
2. Understand the requested change.
3. Choose the smallest suitable solution.
4. Make focused edits.
5. Run relevant checks.
6. Report results and limitations.

Use the existing root npm scripts where applicable:

- `npm run build`
- `npm run typecheck`
- `npm test`

Run relevant checks when permitted.

Do not claim that tests, builds or deployments succeeded without observing
their results.

Do not create or switch branches, commit, push, merge or open pull requests
unless explicitly requested.

Do not deploy to the Raspberry Pi, modify running services, change host
networking or delete persistent production data without explicit authorisation.

## Testing expectations

Tests should cover meaningful behaviour, including:

- Generated and custom alias creation.
- Invalid destination URLs and aliases.
- Reserved and duplicate aliases.
- Generated alias collisions.
- Case-sensitive alias resolution.
- HTTP 302 redirects and `Location` headers.
- Usage count increments and concurrent updates.
- HTTP 404 for unknown or deleted aliases.
- Link deletion.
- Persistence across restarts.
- Existing health endpoint behaviour.
- Frontend creation and management flows.

Prefer behavioural tests over tests tightly coupled to implementation details.

Keep tests proportionate to the feature being implemented.

## Initial release exclusions

Do not introduce the following without an explicit requirement:

- User accounts or authentication systems.
- Public internet hosting.
- Link expiration.
- Editing existing links.
- QR code generation.
- Detailed visitor analytics or tracking.
- Cloud services or external integrations.
- Complex rate-limiting infrastructure.
- Microservices.
- Kubernetes or other orchestration platforms.
- Message queues.
- CQRS or event sourcing.
- Dependency injection frameworks.
- Custom agent communication systems.
- Elaborate deployment pipelines.
- Enterprise approval processes.

SQLite and a single Docker Compose deployment are explicitly justified
by the application's persistence and deployment requirements.

## Guiding principle

**Complexity must justify itself.**
