# ADR 0002 — ActivityPub federation of events

**Status:** accepted, own domain (slice 1 implemented; slices 2 and 3 in progress, behind `FEDERATION_ENABLED`).
**Date:** 2026-11-18.

## Context

ADR 0001 §5 decided that published events federate as ActivityPub `Event` objects and organizers are
followable actors, reusing `@oxy.so/federation`. Federation touches inter-product contracts, so it gets
this plan before the parts that talk to other servers.

## Decision

### Slice 1 — the projection (done)

`packages/backend/src/federation/event.ts` maps an event, its organizer and venue to the vocabulary
Mobilizon and Gancio read (`Event`, `startTime`/`endTime`, `Place`, `status`, `joinMode`), and to a `Note`
for Mastodon-family servers, which ignore `Event`. It is pure and stores nothing: the row is the source of
truth, and `revision` is what an `Update` is derived from. A draft has no projection.

### Slice 2 — actors and discovery

Organizers are actors served under `vibbr.co` (`/ap/actors/<handle>`), with WebFinger, an outbox of their
`Create(Event)` activities and a followers collection, through `createWebfingerRouter` and
`createActorRouter` from `@oxy.so/federation`, the way Mention serves its own domain.

Correction (2026-11-21): this ADR first said Oxy federates under ONE domain and has no registry of
per-product domains. That describes oxy.so's own WebFinger, not what a product can do: Mention serves its
actors under `mention.earth` with the same routers and only delegates KEY CUSTODY to Oxy
(`GET /federation/public-key`, `POST /federation/sign`; the private key never leaves Oxy). Vibbr does the
same, so no new capability is needed in Oxy and organizers are `@handle@vibbr.co`.

What it does need: the Vibbr application declared in oxy's first-party seed with `federation:write`, a
service credential that attests, and each federated organizer linked to an Oxy account whose username is the
handle (that account is what Oxy holds the key for). Keys stay with Oxy; Vibbr never generates or stores an
actor key. The Event routes are NOT mounted before the actors resolve, and nothing is mounted unless
`FEDERATION_ENABLED` is set: an `Event` whose `attributedTo` does not resolve is rejected by remote servers
and is worse than not federating.

### Slice 3 — inbox and delivery

Inbox: `Follow` (answered with `Accept`), `Undo`, and `Delete` of a remote actor. Remote `Join`/RSVP is not
accepted in-band (`joinMode: external`): tickets are bought on Vibbr.

Delivery: `Create`/`Update`/`Delete` of an event to followers' shared inboxes, signed by the actor's key via
Oxy, from a durable queue with bounded retries. A cancelled event is an `Update` with `status: CANCELLED`
(never a `Delete`: tickets and history stay); a deleted draft was never published, so there is nothing to
retract. Delivery re-checks live authority per `@oxy.so/federation`'s `authorizeDelivery` hook.

The queue is the open decision: Mention uses BullMQ on Redis. Vibbr runs no Redis today; a Postgres-backed
outbox table (claim with `FOR UPDATE SKIP LOCKED`, as the housekeeping jobs do) avoids a new service.
Decide when slice 3 starts.

## Consequences

- Slice 1 is testable and safe to ship; it exposes nothing.
- Slices 2 and 3 need Vibbr's entry in oxy's seed (and `federation:write`) before they can sign. Until
  federation is switched on in production, Vibbr is not federated, and no document should say it is.
- Cancellation, edits and deletions follow the event's `revision`, so there is one place that says what
  changed.
