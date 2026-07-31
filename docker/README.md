# Phase 1 groundwork — PostgreSQL in Docker

This folder is **not used by the Phase 0 prototype** (which has no backend, per the roadmap).
It's here so that when you're ready to start the "Next" horizon — a real backend, database,
and the Inquiry→PI→PO→Sales Order flow with enforced business rules — you have a running
starting point instead of a blank page.

## What's here

- `docker-compose.yml` — spins up PostgreSQL 16 locally, plus an optional pgAdmin UI.
- `schema.sql` — a starter schema that mirrors the TypeScript types the prototype already
  uses (`src/lib/types.ts`), so the mock data in `src/lib/mockData.ts` can be seeded in with
  minimal transformation once you build the API layer.

## Running Postgres locally

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) or the Docker
Engine + Compose plugin.

```bash
cd docker
docker compose up -d
```

This starts Postgres on `localhost:5432` (user `fnt`, password `fnt_dev_only`,
database `fnt_erp`) and automatically runs `schema.sql` on first boot.

Check it's healthy:

```bash
docker compose ps
docker compose logs db --tail 50
```

Connect with `psql`, TablePlus, DBeaver, or similar:

```bash
psql postgresql://fnt:fnt_dev_only@localhost:5432/fnt_erp
```

Optional pgAdmin web UI (`localhost:5050`, login `admin@fnt.local` / `admin`):

```bash
docker compose --profile tools up -d
```

Stop everything (data persists in a named volume):

```bash
docker compose down
```

Wipe the database completely and start fresh:

```bash
docker compose down -v
docker compose up -d
```

**Before this goes anywhere near production:** change the password in
`docker-compose.yml`, move secrets into a `.env` file (already gitignored patterns exist for
this — add one), and don't expose port 5432 publicly.

## Wiring up a real backend (suggested shape)

Per the roadmap's Phase 1 stack — Node.js backend, PostgreSQL, shared TypeScript types:

1. Scaffold an API service (e.g. `apps/api` with Express, Fastify, or Hono) in a `server/`
   folder alongside this frontend, or as a sibling repo — either works with the schema as-is.
2. Point it at `postgresql://fnt:fnt_dev_only@localhost:5432/fnt_erp` locally.
3. Reuse `src/lib/types.ts` as the shared contract between frontend and backend (the roadmap
   specifically calls this out as the reason for a one-language stack).
4. Replace the mock actions in `src/lib/store.tsx` (`verifyPayment`, `convertToSalesOrder`,
   `advanceStage`, etc.) one at a time with real API calls — the component layer doesn't need
   to change, since it only talks to the store's functions today.
5. Add authentication and real role-based permissions where the role switcher currently fakes
   them (`src/lib/mockData.ts` → `ROLES`).
6. Add object storage (S3-compatible — MinIO is a good Docker-friendly choice for local dev)
   for the file attachments the Document Center currently only lists by name.

## Deploying the database for a hosted demo

Vercel's serverless functions can call an external Postgres, but they can't run this Docker
container directly — Vercel doesn't host stateful containers. For a hosted Phase 1 demo
(not this Phase 0 prototype), point the same `schema.sql` at a managed Postgres instead:

- [Neon](https://neon.tech) or [Supabase](https://supabase.com) both offer a free Postgres
  tier with a connection string you can paste into Vercel's environment variables — no
  Docker needed on the deployed side. Run `schema.sql` once against that instance (via their
  SQL editor, or `psql <connection-string> -f schema.sql`) and you're set.
- Keep using this `docker-compose.yml` for local development regardless of where the hosted
  database ends up living.
