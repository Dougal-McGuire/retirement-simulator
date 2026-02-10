# Repository Guidelines

## Project Structure & Module Organization
- `src/app`: Next.js App Router pages and route segments (for example `app/setup`, `app/simulation`, `layout.tsx`).
- `src/components`: Shared UI and feature components; primitives live in `src/components/ui`.
- `src/lib`: Core logic and utilities, including simulation, state stores, and PDF generation (`pdf-generator/{templates,styles,charts,utils}`).
- `src/types`: Shared TypeScript types and defaults.
- `public`: Static assets. CI workflows live in `.github/workflows`.
- Tests are colocated as `src/**/__tests__/*.test.ts` or `src/**/*.test.ts`.

## Build, Test, and Development Commands
- `npm run dev`: Start local dev server on port `3000` with Turbopack.
- `npm run dev:clean`: Kill anything on `:3000`, then start dev.
- `npm run build`: Create a production build.
- `npm start`: Serve the production build.
- `npm test`: Run Jest tests once.
- `npm run test:watch`: Run tests in watch mode.
- `npm run lint`: Run ESLint for `.ts`/`.tsx` files.
- `npm run format`: Format the repo with Prettier.

## Coding Style & Naming Conventions
- TypeScript with `strict` mode; use alias imports via `@/*` for `src/*`.
- Use 2-space indentation, single quotes, and omit semicolons.
- Prefer named exports and functional React components with hooks.
- Component filenames use PascalCase (for example `ParameterSidebar.tsx`).
- UI primitives under `src/components/ui` use lowercase filenames (for example `button.tsx`).
- Styling uses Tailwind CSS; keep print/PDF tokens aligned with `src/lib/pdf-generator/styles`.

## Testing Guidelines
- Framework: Jest with `ts-jest` (`jest.config.js`, Node test environment).
- Name tests `*.test.ts` and keep them near the code under test.
- Prioritize coverage for `src/lib/simulation` and transformation logic.
- Use defaults from `src/types` (for example `DEFAULT_PARAMS`) to build stable fixtures.
- Run `npm test` before opening a PR; use `npx jest --coverage` when validating broader changes.

## Commit & Pull Request Guidelines
- Keep commits concise and imperative (for example `Fix Vercel PDF generation`).
- Group related changes into a single commit/PR.
- PRs should include: clear summary, linked issue(s), test updates, and screenshots/GIFs for UI changes.
- Call out higher-risk areas explicitly (for example PDF generation paths or API routes).

## Security & Configuration Tips
- Do not commit secrets or local credentials.
- For local PDF generation, install Chromium or set `CHROME_PATH` (for example `/usr/bin/chromium-browser`).
- Confirm `vercel.json` settings and API route runtime (`nodejs`) before deployment changes.
