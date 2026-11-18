# Deployment

Nothing here has been applied. Each item is an action outside this repo, in order. Vibbr follows
`~/Oxy/Schedio` (the newest app) wherever Mention differs; the infra repo is `oxy-infra`, and its
`terraform-uswest2/*-schedio*.tf` files are the template.

## 1. Owner actions (not automatable from here)

- GitHub: create `OxyHQ/Vibbr`, push, enable the merge queue and the required check (`CI`).
- npm: reserve the `@vibbr.co` scope; configure trusted publishing for `@vibbr.co/contracts` and
  `@vibbr.co/sdk`; a new package needs a first publish plus the owner's npm trust.
- Domain: `vibbr.co` zone on Cloudflare (proxied web at `vibbr.co`, API at `api.vibbr.co`; see
  `oxy-infra/docs/cloudflare-proxied-apis.md`).
- Oxy: register the application in oxy's first-party registry (`actsForPeople`, `actingFor`), which gives the
  `EXPO_PUBLIC_OXY_CLIENT_ID`, the workload identity the backend authenticates with, and the OAuth redirect
  `https://vibbr.co`. Declare the application roles for the operator surface (oxy ADR 0056).

## 2. Infra (oxy-infra, reviewed with a `terraform plan`)

Per Schedio: an ECR repository and its reviewed-image pin, an ECS service and task definition (task role
with the Oxy workload binding), an ALB host rule for `api.vibbr.co`, a deploy role for GitHub OIDC, the
database, SSM parameters (`DATABASE_URL`, `TICKET_CODE_SECRET`), alarms, and a Workers Static Assets project
for the web build. Mind the traps in `docs/infra-and-deploys.md` (a task definition registered but not rolled
out; a deleted SSM parameter that propagates; `desired_count = 0` is unmeasured).

Open decision: own RDS instance, or a database on the shared `oxy-postgres`. The shared one has already had
a multi-app incident (2026-10); an own instance is the safer default unless cost says otherwise.

## 3. Release

- Migrations run before the rollout as a one-shot task (`bun run db:migrate -- --phase=all
  --target-database=<name>`; the target is checked against `current_database()` first).
- `TICKET_CODE_SECRET` must be set (32+ characters) or the backend refuses to start. Rotating it
  invalidates every code in flight, which is harmless: codes live seconds and the app refetches.
- Deploy workflows are written when the infra above exists (Mention's were removed with the copy, being tied
  to its task definitions and parameter names). Keep the smoke test: `GET /health`, then `GET /v1/events`.
- Prelaunch like Schedio: DNS last, by the owner's choice.

## 4. Online payments (later)

`VIBBR_ONLINE_PAYMENTS` is refused until the Peable rail exists (ADR 0001 §3). Turning it on is a second
`PaymentProvider`, Peable's connected accounts for organizers and its funds flow; no schema change.
