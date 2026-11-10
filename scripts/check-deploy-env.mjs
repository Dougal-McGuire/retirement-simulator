#!/usr/bin/env node
// Checks the env file `vercel pull` wrote before `vercel build` bakes it in.
//
// The pages are statically prerendered, so whether the sign-in control and
// cloud sync are switched on (`isAuthConfigured()` / `isCloudStoreConfigured()`
// in src/app/[locale]/layout.tsx) is decided at BUILD time, while
// /api/auth and /api/plans read the RUNTIME env. A pull that misses the
// variables (not set for that environment, or marked "Sensitive" in Vercel,
// whose values `vercel pull` may return empty) would ship a production site with
// the auth UI hidden although the API works. This makes that build fail.
//
// Usage: node scripts/check-deploy-env.mjs <env file> [--require]
//   --require       exit 1 unless both capabilities are configured
//   REQUIRE_AUTH=false / REQUIRE_CLOUD_STORE=false drop one requirement
//   (for a deployment that deliberately runs without it).
// The same rules as src/lib/auth/env.ts and src/lib/server/planStore.ts.
import { readFileSync, appendFileSync } from 'node:fs'

const [file, ...flags] = process.argv.slice(2)
if (!file) {
  console.error('usage: check-deploy-env.mjs <env file> [--require]')
  process.exit(2)
}

/** Minimal dotenv reader for the KEY="value" lines `vercel pull` writes. */
function parseEnvFile(text) {
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!match) continue
    let value = match[2]
    const quoted = /^(['"])(.*)\1$/.exec(value)
    if (quoted) value = quoted[2]
    env[match[1]] = value
  }
  return env
}

let env
try {
  env = parseEnvFile(readFileSync(file, 'utf8'))
} catch (error) {
  console.error(`::error::cannot read ${file}: ${error.message}`)
  process.exit(1)
}

const has = (...names) => names.some((name) => (env[name] ?? '').trim() !== '')

const missing = { auth: [], store: [] }
if (!has('AUTH_SECRET', 'NEXTAUTH_SECRET')) missing.auth.push('AUTH_SECRET')
if (!has('GOOGLE_CLIENT_ID', 'AUTH_GOOGLE_ID')) missing.auth.push('GOOGLE_CLIENT_ID')
if (!has('GOOGLE_CLIENT_SECRET', 'AUTH_GOOGLE_SECRET')) missing.auth.push('GOOGLE_CLIENT_SECRET')
if (!has('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL')) missing.store.push('KV_REST_API_URL')
if (!has('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN')) missing.store.push('KV_REST_API_TOKEN')

const auth = missing.auth.length === 0
const store = missing.store.length === 0
const summary = `Build will bake in: sign-in ${auth ? 'ON' : 'OFF'}, cloud sync ${store ? 'ON' : 'OFF'}`
console.log(summary)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)

if (!flags.includes('--require')) process.exit(0)

const problems = []
if (process.env.REQUIRE_AUTH !== 'false' && !auth)
  problems.push(`sign-in is off: ${missing.auth.join(', ')} empty or missing`)
if (process.env.REQUIRE_CLOUD_STORE !== 'false' && !store)
  problems.push(`cloud sync is off: ${missing.store.join(', ')} empty or missing`)

for (const problem of problems) {
  console.error(
    `::error title=Deploy env incomplete::${problem} in ${file}. The prerendered pages would ` +
      'hide this while the API routes use the runtime env. Set the variables for this Vercel ' +
      'environment (a "Sensitive" variable may be pulled empty), or set the repository ' +
      'variable DEPLOY_REQUIRE_AUTH / DEPLOY_REQUIRE_CLOUD_STORE to false if that is intended.'
  )
}
process.exit(problems.length ? 1 : 0)
