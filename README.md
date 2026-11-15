# Acornelia Condotel & Events Place

Website and booking system under implementation with Next.js, Payload CMS and optional customer accounts.

See the [documentation index](docs/README.md), [full specification](docs/superpowers/plans/2026-11-05-acornelia-website-plan.md), [implementation plan](docs/superpowers/plans/2026-11-13-acornelia-implementation-plan.md), [progress](docs/operations/implementation-progress.md), and [operations guide](docs/operations/deployment.md).

## Run locally

Requires Node 24.22.1+, pnpm 12.5.1 and Docker Compose.

```sh
pnpm install --frozen-lockfile
pnpm local:setup
docker compose up -d database
pnpm db:migrate
pnpm seed:development
pnpm dev
```

Open `http://localhost:3042`. Local fixtures use a provisional Warm Boutique composition and concept photos. Guest checkout stays available. Live booking, hosted media, payment/email providers and production deployment remain gated; see [implementation progress](docs/operations/implementation-progress.md).

The setup command preserves an existing `.env`. Local developer access details, if generated, are kept in protected `.local/development-access.json`, never printed or committed. Tests use the separate `acornelia_test` database on port 55432; its create-once setup is in the [operations guide](docs/operations/deployment.md). Run `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck` and `pnpm build` against the documented local targets.
