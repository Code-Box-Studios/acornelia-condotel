# Project working instructions

## Git

Work directly on `main`. Do not create branches or worktrees unless the user explicitly changes this instruction. Preserve existing uncommitted work, including documentation and design artifacts.

## Documentation

The user requires project decisions and work to be documented in this repository.

- Read [the documentation index](docs/README.md) and the documents relevant to a change before starting work.
- Update the relevant documentation in the same change as a decision, feature, behavior change, configuration change, or deployment change.
- Record the final decision, why it was chosen, its practical limits, and any remaining work. Distinguish user decisions from proposals.
- Keep provider choices, costs, and alternatives in [the technology stack document](docs/architecture/technology-stack.md).
- Keep setup, environment configuration, deployment, recovery, and verification requirements in [the deployment guide](docs/operations/deployment.md).
- Keep business rules and acceptance checks in [the website and booking plan](docs/superpowers/plans/2026-11-05-acornelia-website-plan.md). Keep design decisions in the existing design specifications.
- Add or update links in `docs/README.md` when creating, moving, or retiring a document. Keep the root README useful as an entry point.
- Date provider pricing and link to official sources. State the assumptions behind estimates and distinguish baseline charges from total cost.
- Record what was actually verified and what remains pending. A selected provider, mockup, successful build, or configuration file does not prove a live integration or deployment works.
- Document setup variable names and purposes without storing credentials, private connection strings, authentication URLs, or guest records. Keep secret values in the appropriate protected configuration.
- Document substantive validation results and known limitations. Do not invent test commands, deployment IDs, account details, or completed checks.

Use clear, normal prose in persisted documentation. Avoid copying a conversation transcript when a concise decision and its consequences explain the result.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
