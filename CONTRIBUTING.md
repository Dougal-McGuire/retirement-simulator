# Contributing

Thank you for improving retirement-simulator! Please read `AGENTS.md` for the full Repository Guidelines.

## Quick Start

- Install: `npm ci`
- Develop: `npm run dev` (Turbopack on :3000)
- Test: `npm test` (watch: `npm run test:watch`)
- Build: `npm run build`, then `npm start`

## How to Contribute

1. Create a feature branch: `feat/<scope>-<short-desc>` (e.g., `feat/sim-percentiles-fast`).
2. Make focused changes; follow TypeScript strictness and Tailwind patterns.
3. Add/adjust tests in `src/**/__tests__` or alongside source (`*.test.ts`).
4. Verify locally: `npm test` and `npm run build`.
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

- Local PDF: set `CHROME_PATH` if Chromium isn’t discovered
- Vercel uses `@sparticuz/chromium` automatically

Refer to `AGENTS.md` for structure, commands, and testing details.
