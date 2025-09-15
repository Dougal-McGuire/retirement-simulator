# Repository Guidelines

## Project Structure & Module Organization

- `src/app`: Next.js App Router (e.g., `layout.tsx`, `page.tsx`, `app/setup`, `app/simulation`).
- `src/components`: UI, navigation, and charts. Primitives live in `src/components/ui`.
- `src/lib`: Business logic and utilities (e.g., `simulation`, `stores`, `pdf-generator/{templates,styles,charts,utils}`).
- `src/types`: Shared TypeScript types and defaults.
- `public`: Static assets. `.github/` contains workflows.
- Tests: `src/**/__tests__/*.test.ts` and `src/**/*.test.ts`.

## Build, Test, and Development Commands

- `npm run dev`: Start dev server on `:3000` (Turbopack).
- `npm run dev:clean`: Free `:3000` then start dev.
- `npm run dev:port`: Start on a specific port.
- `npm run build`: Production build (Turbopack).
- `npm start`: Serve the production build.
- `npm test` / `npm run test:watch`: Run Jest tests.
- `./dev.sh`: Stop `:3000` and start dev (helper script).

## Coding Style & Naming Conventions

- Language: TypeScript with `strict` mode and path alias `@/*` → `src/*`.
- Indentation: 2 spaces; single quotes; no semicolons; prefer named exports.
- React: Functional components and hooks; co-locate small components.
- Filenames: Components PascalCase (e.g., `ParameterSidebar.tsx`); UI primitives in `components/ui` are lowercase (e.g., `button.tsx`).
- Styling: Tailwind CSS (`tailwind.config.ts`) with tokens in `pdf-generator/styles` for print.

## Testing Guidelines

- Framework: Jest + `ts-jest` (`jest.config.js`, Node env).
- Locations: `src/**/__tests__` or `*.test.ts` alongside source.
- Run: `npm test`; coverage: `npx jest --coverage`.
- Aim to cover `src/lib/simulation` and key transformers; use `DEFAULT_PARAMS` from `src/types` for fixtures.

## Commit & Pull Request Guidelines

- Commits: Imperative, concise messages (e.g., “Fix Vercel PDF generation”, “Refactor PDF route”). Group related changes.
- PRs: Clear description, linked issues, test updates, and screenshots/GIFs for UI changes. Note risk areas (e.g., `pdf-generator` or API routes).
- Verify locally before opening: `npm test` and `npm run build`.

## Security & Configuration Tips

- PDF generation: Locally, install Chromium or set `CHROME_PATH` (e.g., `export CHROME_PATH=/usr/bin/chromium-browser`). On Vercel, `@sparticuz/chromium` is used automatically.
- Do not commit secrets. Review `vercel.json` and API route runtime (`nodejs`) before deploying.
