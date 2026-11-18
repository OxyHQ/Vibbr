# ADR 0001 — Domain model, payment boundary and federation

**Status:** accepted (owner, 2026-11-18).
**Date:** 2026-11-18.

## Context

Vibbr (`vibbr.co`) is the Oxy events app: anyone, and any artist or company, publishes
structured events and sells or hands out tickets, with resale between people. Mention
shares an event in a post by its id through `@vibbr.co/sdk`; Mention keeps no event data
of its own. The repo starts from a copy of Mention's layout without its history.

## Decision

### 1. Identity and authority

- People sign in with Oxy. An **organizer** is an Oxy account (a person) or an Oxy
  organization. Acting for an organization is read live from Oxy
  (`accountAccessFor`, permissions, never role names), never mirrored in a Vibbr table.
- Vibbr declares what it does for people in oxy's first-party registry (`actsForPeople`)
  and acts with `actingFor`. It never asks a person for scopes, consent or grants.
- Operator surfaces use application roles declared in oxy, held by the owning
  organization's owners/admins.

### 2. Domain objects (all rows carry a `public_id`; the wire never shows internal ids)

| Object         | Public id | Notes                                                                                                                                              |
| -------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organizer      | `org_`    | Profile of an Oxy account/organization that publishes.                                                                                             |
| Venue          | `ven_`    | Reusable place, with coordinates and time zone.                                                                                                    |
| Event          | `evt_`    | Time zone, start/end instants in UTC, physical/online/hybrid, capacity, status `draft/published/cancelled/ended`, `revision` counter.              |
| Ticket type    | `tkt_`    | Price in minor units (`bigint`) + ISO currency, quota, sale windows, per-person limit, named or not, transferable, resale cap, **`payment_mode`**. |
| Order          | `ord_`    | A person's reservation of one or more ticket types.                                                                                                |
| Ticket         | `tix_`    | One admission, one holder, a signed rotating code.                                                                                                 |
| Resale listing | `rsl_`    | A held ticket offered at a price up to the cap.                                                                                                    |

`payment_mode` is per ticket type: `free`, `door` (paid at the box office),
`online`, or `choice` (the buyer picks door or online). `online` and `choice`'s online
branch are disabled until the Peable rail is connected; the schema already carries them.

Money is a `bigint` of minor units with a currency code; a float amount is a bug.
Instants are UTC; an event also stores its IANA time zone. Multi-currency from day one,
tax is not computed by Vibbr (see §3).

### 3. Payments: Vibbr never holds provider credentials

- Online payment goes through **Peable** only. Vibbr stores a Peable reference
  (payment intent public id) on the order, never a provider object or key.
- v1 ships the `PaymentProvider` interface with one implementation that collects
  nothing (`free`/`door`). Peable is a second implementation behind a flag.
- Orders and payments are modelled now (`payment.status = not_collected` in v1) so
  turning Peable on changes no schema. Refunds, payouts to organizers and tax belong
  to Peable's funds flow (Peable ADR 0015, 0020) and are not re-implemented here.

### 4. Tickets, resale and admission

- Reservation is one transaction that locks the ticket type's remaining quota: no
  oversell, idempotency key on every write, reservations expire.
- A ticket's code is signed and rotates, so a screenshot cannot be reused. Door
  scanners validate the signature; offline mode records scans and syncs later, and a
  ticket scanned twice offline is flagged, not silently accepted.
- Transfer and resale re-issue the ticket: the previous code stops validating the
  moment the new holder is recorded. Resale price never exceeds the cap on the ticket
  type; with no online rail in v1 the price is informational and settled off-app.
- Waitlist is per ticket type and offers released quota in order with an expiry.

### 5. Federation (ActivityPub)

- Published events are federated as ActivityPub `Event` objects; organizers are
  followable actors. Federation reuses `@oxy.so/federation` and the connector shape
  from Mention rather than a second implementation.
- Federation is a projection of the event row, never the source of truth. A
  cancelled or edited event federates `Update`/`Delete` from the `revision` counter.
- Federation gets its own plan (it touches inter-product contracts) before code.

### 6. Mention integration

- `@vibbr.co/sdk` exposes read-only event lookup by id/URL and the card data Mention
  renders. A Mention post stores only the event id.
- Mention's own event attachment, attendance table, notifications and screen are
  removed in a separate Mention PR (owner-approved destructive migration). No data is
  migrated.

## Consequences

- Turning on online payments is a Peable binding and a flag, not a rewrite.
- Federating events adds an outbound surface that must follow Mention's federation
  rules (authorized fetch, signatures, deletion).
- The v1 scope is large; it is delivered in phases (skeleton → domain → backend →
  frontend → federation → Mention integration → infra).

## Open points for the owner

- Postgres: own database vs. a schema in the shared `oxy-postgres` (infra decision).
- Who creates the GitHub repo, the `vibbr.co` zone and the `@vibbr.co` npm scope.
