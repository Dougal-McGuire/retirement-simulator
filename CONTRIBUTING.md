# Contributing

Thank you for improving retirement-simulator! Please read `AGENTS.md` for the full Repository Guidelines.

## Quick Start

- Install: `pnpm install`
- Develop: `pnpm dev` (Turbopack on :3000)
- Test: `pnpm test` (watch: `pnpm test:watch`)
- E2E: `pnpm test:e2e` (starts the local app automatically)
- Build: `pnpm build`, then `pnpm start`

## How to Contribute

1. Create a feature branch: `feat/<scope>-<short-desc>` (e.g., `feat/sim-percentiles-fast`).
2. Make focused changes; follow TypeScript strictness and Tailwind patterns.
3. Add/adjust tests in `src/**/__tests__` or alongside source (`*.test.ts`).
4. Verify locally: `pnpm test`, `pnpm test:e2e`, and `pnpm build`.
5. Open a PR using the template. Include:
   - Short summary and rationale
   - Linked issues (Closes #123)
   - Screenshots/GIFs for UI changes
   - Risk areas (e.g., `pdf-generator`, API routes)

## Style & Conventions

- TS, 2-space indent, single quotes, no semicolons
- Components: PascalCase; primitives in `components/ui` lowercase
- Use `@/*` imports from `src/*`

## Security & PDFs

- The primary PDF route is `/api/generate-pdf`, which renders reports with React PDF.
- The HTML print route is legacy and should not be used as the default PDF path unless you are intentionally working on that fallback.

Refer to `AGENTS.md` for structure, commands, and testing details.
