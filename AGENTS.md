# Agent guidelines

Read [`CLAUDE.md`](./CLAUDE.md): it is the single source for commands, architecture, conventions and copy rules in this repository. `CONTRIBUTING.md` has the test workflow (including `PW_REUSE` for E2E) and `DEPLOYMENT.md` the CI/CD pipeline.

The block below is maintained by `next dev` (Next.js `agentRules`); leave it in place.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
