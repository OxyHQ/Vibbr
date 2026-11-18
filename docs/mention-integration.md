# Sharing Vibbr events in Mention

Mention keeps no event data of its own. A post that shares an event stores only the Vibbr event id, and
renders the card through `@vibbr.co/sdk` (`VibbrClient.getEventCard`, `getEventCards` for a timeline page,
`parseEventUrl` for a pasted link). The SDK is read-only and needs no credentials: public events are public.

## What Mention has today (verified 2026-11-18 on `origin/main`, a06650ca2)

A lightweight event attachment inside a post: `EventEditor` in the composer, `app/(app)/events/[id]`,
`EventAttendanceService`, the `event_attendance` table, `posts.content_event_{capacity,cancelled,revision}`,
the `event_updated`/`event_cancelled` notifications, `packages/contracts/src/events.ts`, and event rows in the
account-erasure map and the channel-deletion manifest. It has no tickets, payments or organizers.

## Two changes, in this order (expand, then contract)

Mention's own migration rules say a destructive change ships in a release AFTER the one that stops reading
what it removes, so this is two pull requests, not one.

1. **Expand (additive).** A `vibbrEvent` post attachment (`{ eventId }`), allowed by
   `post_attachments_type_check` (one additive migration), validated in `composeInput.ts`, hydrated into a
   card by the SDK, rendered by `PostAttachmentsRow`, and offered in the composer as a picker that accepts a
   Vibbr link or id and shows the card before attaching. The legacy event attachment still renders.
2. **Contract (destructive, owner-approved).** Remove the legacy attachment end to end: composer editor,
   screen, `useEventManager`, `EventAttendanceService`, the attendance table and `content_event_*` columns,
   the two notification types, the contract, and the erasure/cascade entries and their tests. The owner
   stated there is nothing to migrate; confirm with a read-only count of rows before writing the migration
   (never print a `*_DATABASE_URL`).

## Blocked on

- `@vibbr.co/sdk` published to npm (scope `@vibbr.co` reserved, trusted publisher configured by the owner,
  then a version-bump PR merged: `release-packages.yml` publishes it; never from a laptop).
- Vibbr deployed at `api.vibbr.co`, so the card has something to read.
- Mention's change goes through its own plan mode (federation, migration and an inter-product call), in a
  worktree from `origin/main`. The cross-product read is anonymous and public; it adds no scope, consent,
  key fallback or forwarded session.

## Verification when it is unblocked

`bun run lint` and `bun run check` in Mention; the backend suite from `packages/backend` against a Postgres
the session owns; attach an event in the composer on web and on the Pixel (adb QA), and check the card on a
timeline, in a thread and in a quote; confirm a deleted or cancelled Vibbr event degrades to a "no longer
available" card rather than an error.
