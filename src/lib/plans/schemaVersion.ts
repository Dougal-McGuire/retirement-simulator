/**
 * Version of the persisted plan shape, shared by the browser and `/api/plans`.
 *
 * WHY THIS EXISTS: a browser tab can keep running an old build for days. When
 * the plan shape gains a field, that old tab's normalizers do not know it — and
 * some of them *drop* what they do not understand. In the incident that
 * introduced this guard, a tab from before `CashFlow.enabled` pulled a plan with
 * a switched-off one-off income, its `reconcileCashFlows` treated the legacy
 * `oneTimeIncomes` projection as authoritative, dropped the flow and pushed the
 * result back. Cloud and localStorage only keep the latest state, so the flow
 * was gone everywhere.
 *
 * THE RULE: the client sends `PLAN_SCHEMA_VERSION` in the `x-plan-schema`
 * header on every `GET`/`PUT /api/plans`. The server answers `409` and neither
 * reads nor writes when the versions differ (a missing header counts as 1, i.e.
 * every build from before this guard), or when the stored blob was written by a
 * newer version than the server's own (a rollback). The blob records the
 * highest version that ever wrote it in its `schemaVersion` field.
 *
 * BUMP RULE: increment `PLAN_SCHEMA_VERSION` whenever the persisted plan shape
 * (anything in `Plan` / `SimulationParams` that is stored and synced) gains a
 * field or a meaning that an older build would misread, rewrite or drop. A
 * purely additive field every older normalizer passes through untouched does
 * not need a bump — when in doubt, bump: the cost is that open tabs of the old
 * build stop syncing until they are reloaded.
 *
 * History:
 *   1 — everything before the guard (no header sent).
 *   2 — `CashFlow.enabled` (switched-off flows, 62d6132).
 */
export const PLAN_SCHEMA_VERSION = 2

/** Request and response header carrying a plan schema version. */
export const PLAN_SCHEMA_HEADER = 'x-plan-schema'

/** Response header carrying the server's build id (when it knows one). */
export const BUILD_ID_HEADER = 'x-build-id'

/** Version assumed for a request or blob that does not state one. */
export const LEGACY_PLAN_SCHEMA_VERSION = 1

/**
 * `409` error codes of `/api/plans`.
 *
 *  - `outdated-client`: the client's schema is older than the server's.
 *  - `outdated-server`: the client, or the stored blob, is newer than this
 *    deployment (a rollback while newer tabs or data exist).
 *
 * Both mean "this tab must not sync"; a reload is the way out of either.
 */
export const OUTDATED_CLIENT_ERROR = 'outdated-client'
export const OUTDATED_SERVER_ERROR = 'outdated-server'

/** Parses a version from a header or blob field; anything unusable is legacy. */
export function parsePlanSchemaVersion(value: unknown): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN
  return Number.isInteger(parsed) && parsed >= LEGACY_PLAN_SCHEMA_VERSION
    ? parsed
    : LEGACY_PLAN_SCHEMA_VERSION
}

/**
 * Id of the build this bundle was compiled from, inlined at build time (see
 * `next.config.ts`: `NEXT_PUBLIC_BUILD_ID`, else Vercel's commit SHA). Empty in
 * a local build without either — then no build comparison happens.
 */
export const BUILD_ID: string = process.env.NEXT_PUBLIC_BUILD_ID ?? ''

/**
 * Whether the server reports a different build than this bundle's. Only a
 * hint ("a new version is available"): schema compatibility is decided by the
 * schema version, never by the build id.
 */
export function isDifferentBuild(serverBuildId: string | null | undefined, clientBuildId = BUILD_ID): boolean {
  if (!serverBuildId || !clientBuildId) return false
  return serverBuildId.trim() !== clientBuildId.trim()
}
