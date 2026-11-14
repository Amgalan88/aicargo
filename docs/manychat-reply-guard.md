# ManyChat reply guard

Code and test contract for the downstream routine. This is not a production activation. The gateway stays off unless `MANYCHAT_GATEWAY_ENABLED` is exactly the string `true` (no other value, including surrounding whitespace, turns it on). The migration is unapplied. The queue topic is not created by tests. The live direct ManyChat path is unchanged.

Schema, operator only: `scripts/add-manychat-gateway.ts` applies `prisma/migrations/20261106120000_manychat_gateway/migration.sql`. Every statement is `IF NOT EXISTS`, so running it again is safe. Rollback, also operator only: `scripts/sql/2026-11-manychat-gateway-rollback.sql`. Tests apply those statements to embedded Postgres and do not open a hosted database.

The webhook is a wake. It is not a customer reply. One wake does not guarantee one customer reply across all time.

## Two clocks

- Normal burst: one fragment wakes at about 5 seconds. Later fragments from the same contact reset a 5 second quiet period and never wait past 8 seconds from the first fragment. A fragment at exactly 8 seconds does not join. That unsent batch is superseded, and the folded successor waits its own 5 seconds, so that boundary can be delivered at 13 seconds.
- Lost publish: if the queue send times out and the queue did not accept it, recovery is the daily cron `30 20 * * *`, not the 5–8 second path. A Pro operator can later choose `* * * * *`, which is still up to one minute.

## Endpoints

Host: `https://darkhan.aicargo.mn`

| Action | URL |
| --- | --- |
| Read current revision | `POST https://darkhan.aicargo.mn/api/manychat/reply-guard/revision` |
| Reserve one send | `POST https://darkhan.aicargo.mn/api/manychat/reply-guard/claim` |
| Finish the reservation | `POST https://darkhan.aicargo.mn/api/manychat/reply-guard/finish` |

`Authorization: Bearer <MANYCHAT_REPLY_GUARD_SECRET>`

`MANYCHAT_REPLY_GUARD_SECRET` is the only credential for these three routes. Do not send `BOT_API_KEY` (that key searches phones and registers parcels). Do not send `MANYCHAT_GATEWAY_SECRET` (that key is held by ManyChat for ingress). Do not send `CARGO_SUPPORTER_WEBHOOK_KEY` (that key authenticates the wake from this app to the routine). No secret value belongs in source or logs.

ManyChat should keep calling the `darkhan` host so `x-cargo-slug` is `darkhan`. Another slug is 403 `forbidden_tenant`.

These handlers do not call out, do not publish a queue message, and do not accept a destination URL.

## What the caller must store

Before `claim`, durably store `{ batch_id, revision, claim_id, local: pending }`. `claim_id` is the caller's idempotency key, 8–128 characters from `A-Za-z0-9_.:-`.

Only a stored HTTP 200 body with `grant: true` authorizes one customer send. A timeout, a 5xx, a 4xx, and a 200 with `grant: false` do not. A retry is not a fresh grant. If the first response was lost, the retry returns `already_reserved` with `grant: false`. That is a safe drop: do not send. Close it with `finish` outcome `unknown` or `not_sent` only if the replay returned the same `reservation_id` for the same `claim_id`. If the caller never stored `grant: true`, it must not send.

Before `finish`, durably store `finish_id` and the outcome. Retry the same pair. Do not change the outcome on retry. The first finished outcome stays.

## Webhook fields the guard echoes

The wake body already contains:

```json
{
  "tenant": "darkhan",
  "subscriber_id": "1234567890",
  "last_input_text": "21 дээр байгаа юу\nБайршил",
  "event_id": "evt-2",
  "batch_id": "8c0b1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4",
  "revision": 2,
  "gate": {
    "decision": "forward",
    "provenance": {
      "tenant_source": "server_constant",
      "page_id": "413037705220679",
      "page_source": "server_allowlist",
      "sender_attestation": "manychat_shared_secret",
      "subscriber_verified": false,
      "text_trust": "untrusted_customer_content"
    }
  }
}
```

The guard does not trust `tenant`, `page_id`, or `subscriber_id` from the caller as ownership. It loads `batch_id` from Postgres. The row must be tenant `darkhan` and page `413037705220679`. An optional `subscriber_id` is only a match check against that row. Sending `tenant`, `page_id`, `webhook_url`, `owner`, `gate`, or `text` is 400 `untrusted_field`. The read response does not copy `last_input_text`; the text stays on the wake.

`revision` on the wake is the batch revision at handoff. The contact cursor (`current_revision`, `latest_batch_id`) is what claim compares, under the same subscriber lock ingress uses.

## Read

`POST /api/manychat/reply-guard/revision`

```json
{ "batch_id": "8c0b1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4" }
```

200:

```json
{
  "ok": true,
  "grant": false,
  "reason": "read",
  "tenant": "darkhan",
  "subscriber_id": "1234567890",
  "batch_id": "8c0b1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4",
  "batch_revision": 2,
  "current_revision": 2,
  "latest_batch_id": "8c0b1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4",
  "current": true,
  "reservation_state": "none",
  "reservation_id": null
}
```

`grant` is always false. `reservation_state` is `none`, `reserved`, `sent`, `not_sent`, `unknown`, `expired`, or `superseded` for this batch revision.

## Claim

`POST /api/manychat/reply-guard/claim`

```json
{
  "batch_id": "8c0b1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4",
  "revision": 2,
  "claim_id": "claim-8c0b1d2e-001"
}
```

200 grant, the only send authorization, and only on the first successful insert:

```json
{
  "ok": true,
  "grant": true,
  "reason": "reserved",
  "tenant": "darkhan",
  "subscriber_id": "1234567890",
  "batch_id": "8c0b1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4",
  "revision": 2,
  "reservation_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "claim_id": "claim-8c0b1d2e-001",
  "expires_at": "2026-11-06T00:02:05.000Z",
  "finish_binding": "reservation_id"
}
```

`expires_at` is 120 seconds after the grant. Expiry is applied on the next read, claim, or finish under the subscriber lock. It does not create a new grant. After expiry the state is `expired` (known no-send). A late `finish` of `sent` is 409 `expired` and does not reopen the reservation.

200 no-grant examples:

```json
{ "ok": true, "grant": false, "reason": "stale_revision", "replay": false, "reservation_id": null }
```

```json
{ "ok": true, "grant": false, "reason": "already_reserved", "replay": true, "reservation_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" }
```

The replay body is for the same `claim_id` only. A different `claim_id` gets `reservation_id: null`. Neither body authorizes a send.

Other `reason` values with `grant: false`: `already_finished`, `unknown_outcome`, `expired`, `superseded`, `wake_uncertain`, `not_eligible`.

`not_eligible` means the batch is still open or queued, or it was suppressed or superseded. `wake_uncertain` means the wake POST outcome is uncertain. That wake does not become a customer-send grant, and calling claim again does not change that.

A `claim_id` already used for another batch or revision is 409 `claim_id_mismatch`. No second reservation is created.

## Finish

`POST /api/manychat/reply-guard/finish`

`outcome` is `sent` (known success), `not_sent` (known no-send), or `unknown`.

```json
{
  "batch_id": "8c0b1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4",
  "revision": 2,
  "reservation_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "finish_id": "finish-8c0b1d2e-001",
  "outcome": "sent"
}
```

200:

```json
{
  "ok": true,
  "grant": false,
  "reason": "finished",
  "replay": false,
  "outcome": "sent",
  "tenant": "darkhan",
  "subscriber_id": "1234567890",
  "batch_id": "8c0b1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4",
  "revision": 2,
  "reservation_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "finish_id": "finish-8c0b1d2e-001"
}
```

The same `finish_id` and the same outcome return 200 `replay: true`. A different outcome or a different `finish_id` is 409 `finish_mismatch`. The stored outcome stays. `unknown` is terminal: a later claim for that revision returns `unknown_outcome` and `grant: false`. Nothing in this handler retries an unknown send.

`finish_binding` is `reservation_id`. Finish must present that id with the same `batch_id` and `revision`. A mismatch is 409 `reservation_mismatch`.

## State machine

One reservation row per contact revision. The subscriber lock is the same lock ingress holds.

1. Claim inserts `reserved` only when the batch revision, the contact cursor, and `latest_batch_id` all match, and the batch is `sending` or `delivered`.
2. A second claim for that revision does not insert.
3. Ingress that bumps the contact revision marks every still-`reserved` row `superseded` in that same transaction. `delivered` and `uncertain` batches are not folded into the new text.
4. Finish of a `reserved` row whose cursor has moved marks `superseded` and returns 409. It does not record `sent`.
5. `expired` and `superseded` are known no-sends. They do not become a new grant.

Lost reserve confirmation: the row can exist while the caller did not see `grant: true`. Replay does not grant. The customer send is dropped unless the caller already stored the original grant. The reservation then expires, or the caller finishes `unknown` / `not_sent`. There is no automatic retry.

## Remaining race

The customer send happens outside this database. After `grant: true` is stored, a newer fragment can commit and supersede the reservation before `finish`. If the routine has not handed the text to the channel yet, it must not send after 409 `superseded`. If the channel send is already in flight, this repository cannot pull it back. That is why this contract is not exactly-once for all time.

A publish that timed out and was not accepted still waits for the daily cron. That gap is separate from the 120 second reservation TTL.

## Status codes

| Status | Meaning |
| --- | --- |
| 200 `grant: true` | First claim only. Store it, then one send is authorized until expiry or a newer revision. |
| 200 `grant: false` | Decision complete. Do not send. Do not treat a retry as a new grant. |
| 400 | `invalid_body`, `invalid_batch`, `invalid_revision`, `invalid_subscriber`, `invalid_claim`, `invalid_reservation`, `invalid_finish`, `invalid_outcome`, `untrusted_field` |
| 401 | Bearer is missing or is not `MANYCHAT_REPLY_GUARD_SECRET` |
| 403 | `forbidden_tenant`, `disabled`, `forbidden_scope`, `forbidden_subscriber` |
| 404 | `batch_not_found` or `reservation_not_found` |
| 409 | `claim_id_mismatch`, `reservation_mismatch`, `finish_mismatch`, `expired`, `superseded` |
| 503 | `not_configured` (guard secret unset) or `unavailable` (ledger error). Not a grant. If the claim committed before the error reached the client, the retry is `already_reserved` and the send stays dropped. |

Flag off is 403 `disabled` before any ledger read. Default remains off.

## Cargo Supporter checklist

1. Keep the direct ManyChat path until an operator sets `MANYCHAT_GATEWAY_ENABLED=true` after the migration and this secret exist.
2. On each wake, read `batch_id` and `revision`. Optionally `POST /revision` and require `current: true`.
3. Persist `claim_id` first. `POST /claim`. Send to the customer only after storing `grant: true`.
4. On timeout or `grant: false`, do not send. Finish `unknown` only when the same `claim_id` replay returned `reservation_id` and no send was made.
5. Persist `finish_id` and outcome. `POST /finish`. Retry that same pair. Never replace `unknown` with `sent` to obtain another grant.
6. Stop if `finish` returns `superseded` or `expired` and the channel send has not started.
7. Hold the reservation for less than 120 seconds.
8. Expect a fragment at the 8 second boundary to wake once at about 13 seconds, and expect a lost queue publish to wait for the daily cron.
