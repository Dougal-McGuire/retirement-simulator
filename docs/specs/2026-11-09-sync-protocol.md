# Plan sync protocol (v3)

- **Status:** implemented · **Date:** 2026-11-09 · **Schema:** `PLAN_SCHEMA_VERSION = 3`
- **Why:** a review found six ways the previous protocol lost data: a failed store read was served as an empty account and then overwritten, a client could push without ever having pulled, deleted plans came back, two devices' starter plans overwrote each other, a fast device clock won every merge, and a pending push was dropped on sign-out.
- **Code:** `src/lib/server/planStore.ts` (store), `src/app/api/plans/route.ts` (API), `src/lib/stores/planSync.ts` (merge, transport, status), `src/components/auth/PlanCloudSync.tsx` (loop), `src/lib/plans/schemaVersion.ts` (versions and headers).

The browser stays the source of truth. The server holds one blob per Google account; a device merges with it and writes the merge back. Sync is optional as before: without store credentials `/api/plans` answers `501` and plans stay in localStorage.

## 1. What is stored

Two Redis keys per account. `<hash>` is `hashUserId(accountId)`.

| Key                    | Value                                                                  |
| ---------------------- | ---------------------------------------------------------------------- |
| `plans:v1:<hash>`      | `{ schemaVersion, rev, updatedAt, plans, deletedPlans, activePlanId }` |
| `plans:v1:<hash>:meta` | `"<rev>:<schemaVersion>"`                                              |

- `rev` counts the writes to the blob. The meta key is the authority; the copy in the blob is informational.
- `deletedPlans` maps a deleted plan id to the time it was deleted (a tombstone).
- `activePlanId` is the plan selected on the device that wrote last. It is only a hint for a device that adopts the account wholesale. The selection is per device and is not synced.
- Outside production the keys carry `VERCEL_ENV` as a prefix (`preview:plans:v1:…`). Production, and any server without `VERCEL_ENV`, keeps the unprefixed keys, so existing data stays where it is.

Every request to the store has a 4 s timeout.

## 2. The API

Both methods need a signed-in account (`401`) and a configured store (`501`), and both state the client's schema version in `x-plan-schema`.

| Request                     | Answer                                                        | Meaning                                                                                                           |
| --------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET`                       | `200 { configured, schemaVersion, rev, blob }` + `x-plan-rev` | `blob: null` means the account holds nothing, and nothing else.                                                   |
| `GET`                       | `502 { error: 'read-failed' }`                                | The store could not be read: unreachable, timeout, error answer (quota), or a stored value that cannot be parsed. |
| `PUT` + `x-plan-rev: <rev>` | `200 { configured, rev, updatedAt }` + `x-plan-rev`           | Stored. `rev` is the new revision.                                                                                |
| `PUT`                       | `412 { error: 'rev-mismatch', rev }`                          | The account is not at the revision the client named. Nothing was written.                                         |
| `PUT`                       | `428 { error: 'rev-required' }`                               | No usable `x-plan-rev`. Nothing was written.                                                                      |
| `PUT`                       | `400` / `413` / `502`                                         | Invalid body / larger than 256 kB / store failure. Nothing was written.                                           |
| either                      | `409 { error: 'outdated-client' }`                            | The client's schema is older than the server's. Nothing is read or written.                                       |
| either                      | `409 { error: 'outdated-server' }`                            | The client, or the stored blob, is newer than this deployment (a rollback). Nothing is read or written.           |

**Compare-and-set.** A `PUT` is one `EVAL` of `COMPARE_AND_SET_SCRIPT`. The script reads the meta key, refuses a blob written by a newer schema, compares the stored revision with the one the client named, and replaces blob and meta together. Redis runs a script atomically, so there is no check-then-write window and no separate read before a write.

**Server clock.** On a write the server stamps `updatedAt` and `schemaVersion` itself and clamps every plan `updatedAt`, `createdAt` and deletion time that lies in the future to its own clock.

## 3. The client loop

One session per signed-in namespace. Requests run one at a time.

| Phase             | Meaning                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `disabled`        | Signed out, no store (`501`), or no session (`401`).                                              |
| `syncing`         | A request is in flight.                                                                           |
| `synced`          | The account matches what this device would send.                                                  |
| `offline`         | The last attempt failed. Retried on the next plan change, the next focus, and the `online` event. |
| `outdated`        | `409 outdated-client`. Stops for the life of the page; the reload card appears.                   |
| `server-outdated` | `409 outdated-server`. Paused, no reload card; retried on the next focus only.                    |

1. **Reconcile:** pull, merge (§4), apply to the local store, push if the account differs from the merge.
2. **Then:** a plan change pushes after a 2 s debounce; a focus pulls (at most every 10 s).
3. **No push without a pull.** The session holds the revision of its last successful pull. While it has none, a change retries the reconcile instead of pushing. A failed pull is `offline`; it is never merged and never treated as an empty account.
4. **`412`:** pull, merge, push against the new revision. After three rounds the session goes `offline` and tries again later.
5. **Flush:** on `pagehide`, when the tab is hidden, and before sign-out (`flushPlanSync()`, which waits at most 1.5 s), a change still waiting for its debounce is pushed at once with `keepalive`. A session that has not pulled does not flush.
6. **Namespace guard:** the session belongs to one account. Once the storage namespace points elsewhere it applies nothing and sends nothing, even if an answer is still in flight.

## 4. Merge rules

The merge compares each plan with the **sync base**: the `updatedAt` the account last held for that plan as far as this device knows (`syncedPlanStamps`, persisted per namespace, written only by the loop). "Changed" means "has a different `updatedAt` than the base".

**Whole-workspace cases**

| Account   | Device                 | Outcome                                                                                         |
| --------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| empty     | untouched starter plan | `idle`: nothing happens; the first real edit pushes.                                            |
| empty     | has work               | `seed`: the device's plans go up.                                                               |
| has plans | untouched starter plan | `adopt`: the account's plans, tombstones and selection replace the starter. Nothing is written. |
| has plans | has work               | `merge`: plan by plan, below.                                                                   |

**One plan, held by both sides**

| Device copy | Account copy                  | Result                                                               |
| ----------- | ----------------------------- | -------------------------------------------------------------------- |
| unchanged   | unchanged                     | Nothing.                                                             |
| unchanged   | changed                       | The account's copy, whatever the timestamps say.                     |
| changed     | unchanged                     | The device's copy; pushed.                                           |
| changed     | changed, same parameters      | The account's copy. If only the name differs, the later rename wins. |
| changed     | changed, different parameters | **Conflict copy** (below).                                           |

**Without a base** (the device never synced that plan) both copies count as changed. Two exceptions keep an upgrade quiet:

- A generated id (`plan-<time>`) belongs to one plan. If the account's copy is newer, the device's copy is taken to be stale and is replaced. If the device's copy claims to be newer, both are kept.
- The starter id `plan-base` is created independently on every device, so two of them are unrelated plans. Both are kept, unless one is still the untouched starter, which simply gives way. The exception: a device that shares a generated id with the account has synced with it before, so its `plan-base` is the account's and follows the rule for generated ids.

**Conflict copy.** The account's version keeps the id. The device's version becomes a new plan named `"<name> (copy from this device)"` / `"<name> (Kopie von diesem Gerät)"`, with an id derived from the original id and stamp (so two tabs produce the same copy). The device's selection, and an unsaved edit, follow the copy. A card tells the user.

**A plan held by one side only**

| Situation                                                                                                | Result                                                                                                                               |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Missing on the other side, no tombstone                                                                  | Copied to the other side. Absence never deletes.                                                                                     |
| On the device; the account has a tombstone; unchanged since the base                                     | Dropped on the device.                                                                                                               |
| On the device; the account has a tombstone; changed since the base                                       | Survives; the tombstone is cleared.                                                                                                  |
| On the device; the account has a tombstone; unchanged, but it is the plan being edited (unsaved changes) | Survives, stamped as changed now, so the deleting device keeps it too. Unsaved work wins over a deletion as over any other update.   |
| In the account; the device has a tombstone; the account's copy is the revision in the base               | Removed from the account; the tombstone goes up.                                                                                     |
| In the account; the device has a tombstone; the account's copy is a later revision                       | Returns to the device; the tombstone is cleared.                                                                                     |
| Tombstone, but no base for that id (generated id)                                                        | Timestamps decide: the plan survives if `updatedAt > deletedAt`.                                                                     |
| Tombstone for `plan-base`, but no base                                                                   | The tombstone belongs to another device's starter plan and does not apply. A worked-in starter plan on the device moves to a new id. |

**Tombstones.** `deletePlan` records `deletedPlans[id] = max(now, plan.updatedAt)`. Tombstones of both sides are united (latest time per id). A plan that survives clears its tombstone. A tombstone expires after 180 days (`PLAN_TOMBSTONE_TTL_MS`) and at most 200 are kept (`MAX_PLAN_TOMBSTONES`, newest first). A device that stays offline longer than 180 days can bring a deleted plan back. The base of a deleted plan is kept as long as its tombstone.

"Undo" after a deletion creates the plan again under a **new** id (`createPlan`). The tombstone of the old id stays, deliberately: clearing it would let a device that still holds the old copy push it back next to the restored one.

A merge never leaves a workspace empty: if every plan would be deleted, the device's plans stay.

**Plan limit (`MAX_PLANS` = 12).** Nothing is dropped to fit. Each side keeps every plan it has. The device takes as many of the account's other plans as it has room for, newest first; the account takes as many of the device's other plans as it has room for, newest first. A conflict that would need a copy stays unresolved while the device is full: each side keeps its version and the base does not move. The status dot and a card say how many plans are not synced. Deleting plans frees room and the rest follows.

**Clocks.** A save stamps `max(now, previous updatedAt + 1)`. With a base, a merge does not compare clocks at all. The server clamps future stamps (§2).

## 5. What existing clients and data experience

- **A v2 tab** (any build before this one) sends `x-plan-schema: 2`. Every `GET` and `PUT` is answered `409 outdated-client` before the store is touched. The tab shows its reload card, keeps its plans locally and can neither read nor write the account. After the reload it runs this protocol.
- **A blob written by v2** has no `rev`, no `deletedPlans` and no meta key. It is served as revision 0 with no tombstones. The first write names revision 0, upgrades the blob to schema 3 and creates the meta key. For such a blob the script reads the schema version from the blob text, so a blob newer than the server is still never overwritten.
- **A device that last synced under v2** has no sync base. Its first reconcile uses the "without a base" rules: identical plans agree silently, an older local copy of a plan is replaced as before, and only a local copy that claims to be newer produces a conflict copy. If the device holds nothing but a worked-in `plan-base` that differs from the account's, nothing proves it ever synced, and both starter plans are kept — one copy, once.
- **A rollback** to the v2 server: it refuses the v3 blob and v3 tabs with `409 outdated-server`. v3 tabs pause (`server-outdated`) and resume by themselves once the server is rolled forward.
- **Plans deleted under v2** left no tombstone. A device that still holds one brings it back once, as it always did.

## 6. Tests

| What                                                                                                            | Where                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Store: read outcomes, timeout, compare-and-set, clamping, key prefix                                            | `src/lib/server/__tests__/planStore.test.ts`                                    |
| The Lua script on a real Redis (skipped where `redis-server` is missing)                                        | `src/lib/server/__tests__/planStoreRedis.test.ts`                               |
| Route: `502`, `412`, `428`, schema guard, v2 refused                                                            | `src/app/api/plans/__tests__/route.test.ts`                                     |
| Merge rules, transport                                                                                          | `src/lib/stores/__tests__/planSync.test.ts`                                     |
| Store actions: tombstones, stamps, `applySyncedPlans`                                                           | `src/lib/stores/__tests__/planCloudSync.test.ts`, `planSyncPersistence.test.ts` |
| The loop against the real route and a fake store: the review's scenarios S1–S6, `412`, flush, focus, plan limit | `src/lib/stores/__tests__/planCloudSyncScenarios.test.ts`                       |
| The loop and the schema guard                                                                                   | `src/lib/stores/__tests__/planCloudSyncGuard.test.ts`                           |
| Browser: `502` on `GET`, `412` on `PUT`, both `409`s                                                            | `tests/cloud-sync-guard.spec.ts`                                                |
