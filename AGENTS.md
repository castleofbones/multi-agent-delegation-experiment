# Project principles

## Context

This is a personal engineering experiment, not enterprise production software.
The application is deliberately small. Its purpose is to support experiments
in AI-agent collaboration.

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

## Agent collaboration

The project will eventually contain six OpenCode agents: Coordinator,
Architect, React Specialist, Node.js Specialist, Code Reviewer and Tester.
Their definitions will be added in a future phase.

Use OpenCode's native delegation capabilities when that phase begins.
Do not build custom agent orchestration infrastructure.
The Coordinator should invoke only specialists relevant to the task.
The Architect should prefer the simplest design satisfying current requirements
and recognise that "no architectural change required" is a valid recommendation.

## Working practices

Before changing code:

1. Inspect the relevant existing implementation.
2. Understand the requested change.
3. Choose the smallest suitable solution.
4. Make focused edits.
5. Run relevant checks.
6. Report results and limitations.

Do not create commits or push changes unless explicitly requested.
GitHub's normal Copilot pull-request workflow is permitted for this initial scaffold.

## Prohibited complexity without explicit requirements

Do not introduce:

- Kubernetes
- Microservices
- Docker orchestration
- Databases
- Authentication systems
- Message queues
- CQRS or event sourcing
- Dependency injection frameworks
- Custom agent communication systems
- Elaborate deployment pipelines
- Enterprise approval processes

The guiding principle is:

**Complexity must justify itself.**
