# Vibbr

Events and tickets app (iOS, Android, web) on Oxy: anyone, and any artist or company, publishes
structured events and sells or hands out tickets, with resale between people. Bun monorepo.
Domain `vibbr.co`; API `api.vibbr.co`.

## Commands

Run from the repo root with Bun (the version pinned in `packageManager`; the global one may differ,
use `npx bun@<version>` when it does).

```bash
bun install                 # postinstall builds contracts and the SDK
bun run dev:backend         # Express 5 on :3000 (set DATABASE_URL, see below)
bun run dev:frontend        # Expo (web with `w`)
bun run build               # contracts + sdk + backend
bun run test                # contracts, sdk, backend, frontend
bun run lint                # Biome + tsc per package; lint:fix to apply
bun run check               # workspace gates + build + typecheck
```

Backend tests need a Postgres server: `docker compose -f docker-compose.postgres.yml up -d postgres`,
then `TEST_DATABASE_URL=postgres://vibbr:vibbr@127.0.0.1:5434/postgres bun run test:backend`. The
suites create their own throwaway database on that server; without the variable the database suites
skip, which is not a pass. Verify the server is yours before pointing tests at it.

## Map

- `packages/contracts` (`@vibbr.co/contracts`): zod schemas, the source of truth for ids, money, events,
  tickets, errors. Change a public shape here first.
- `packages/backend` (`@vibbr.co/backend`): Express 5, Drizzle on PostgreSQL via `@oxy.so/db` (Bun SQL).
- `packages/sdk` (`@vibbr.co/sdk`): read-only event cards for embeds (Mention posts store only the event id).
- `packages/frontend`: Expo + Bloom + expo-router. Compose UI from Bloom; domain components
  (`EventCardView`, `TicketPicker`) are app-local until they move to Bloom.
- Decisions: `docs/adr/`. Start with ADR 0001.

## Conventions

- Public ids are `<prefix>_<24 hex>`; the internal key never reaches the wire. Money is a `bigint` of minor
  units plus an ISO currency, a decimal string on the wire; a float amount is a bug.
- Quota is taken with one guarded UPDATE (`sold + n <= quota`) inside the order transaction. Never
  read-then-write a counter.
- Every write that can be retried takes an idempotency key (orders) or is naturally idempotent.
- A ticket's QR code is signed and rotating; transfer and resale bump `codeVersion` so the old code dies.
- Online payment is Peable's (ADR 0001 §3). Vibbr never holds a provider credential or object.
- First-party never asks people for permissions: Vibbr acts for a person with `actingFor` on what oxy's
  first-party registry declares (oxy ADR 0066). Authority over an organization is read live from Oxy.
- Biome formats and lints. In tests use `must(x)` (`src/testing/must.ts`), not `x!`.
- Every migration carries `-- oxy:deploy-phase=pre|post`; apply only with `bun run db:migrate`.

## Boundaries

- Never `git stash`. Never publish to npm from a laptop. Never print `.env` or `*_DATABASE_URL`.
- Ask first before changing a gate, a Drizzle migration, or CI workflows.
- Branch from `origin/main` in a worktree; merge with a bare `gh pr merge --squash`.
