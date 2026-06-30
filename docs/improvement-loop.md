# Improvement Loop

This loop is for small, verified improvements that can be reviewed and deployed frequently without turning production into an experiment.

## Cadence

- Every 10 minutes: wake up, run code-quality, speed, and UX audit threads, then send one narrow implementation task to a worker thread.
- In normal mode: stop after a verified changed cycle so the diff can be reviewed and committed manually.
- In explicit deploy mode: every other hour, run a critic thread, run the full deploy gate, commit the accumulated verified changes, and deploy by pushing `main`.
- Stop the loop if verification fails, the worktree contains unrelated dirty files, production deployment is unavailable, protected env-local files are changed, or a thread reports a high-risk change.

## Local Commands

```bash
make improvement-loop
make improve-deploy
pnpm run improve:once
pnpm run improve:loop
pnpm run improve:deploy
```

`make improvement-loop` and `make improve-loop` run the non-deploy loop. They wake every 10 minutes, then stop after a verified changed cycle so the diff can be reviewed and committed manually. The script refuses to start automated edit cycles on a dirty worktree unless `IMPROVEMENT_LOOP_ALLOW_DIRTY=1` is set.

`make improve-deploy` is the unattended production loop. It requires `main`, an upstream tracking branch, configured Git author metadata, the repo Node/pnpm engines, and no protected env-local changes. In deploy mode, the script keeps verified cycle changes pending, runs the full validation gate every other hour, commits, and pushes clean `main`.

The loop uses `gpt-5.5` by default. Override with `IMPROVEMENT_LOOP_CODEX_MODEL=<model>` when you want a cheaper or faster unattended pass.

If an audit, critic, or validation gate rejects a cycle, the loop writes the report and rejected patch under `.improvement-loop/<cycle>/`, leaves the rejected diff in the worktree, and stops for manual review. Set `IMPROVEMENT_LOOP_RESET_REJECTED=1` or pass `--reset-rejected` only when you intentionally want the old reset-and-continue behavior.

The loop enforces the repo engines from `package.json`; use Node 24.14.0 (`.node-version` / `.nvmrc`) and pnpm 10. Set `IMPROVEMENT_LOOP_ALLOW_ENGINE_MISMATCH=1` only for a deliberate local experiment.

## Thread Model

Use separate threads for distinct work. Give each thread a narrow ownership area and tell it not to revert other edits.

1. Code quality thread: refactors, dead code removal, testability, type safety, local conventions.
2. Speed thread: bundle, render, simulation, worker, CI, and PDF generation performance.
3. UX thread: usability, accessibility, responsiveness, copy, navigation, and chart readability.
4. Critic thread: reviews diffs, tests, risks, deployment readiness, and rollback notes.

## Ten-Minute Coordinator Prompt

```text
You are running the retirement-simulator improvement loop.

Repo rules:
- Read AGENTS.md first.
- Preserve existing uncommitted work. Never revert files you did not change.
- Keep changes small enough to verify within this cycle.
- Prefer existing Next.js, React, Tailwind, Jest, Playwright, Zustand, next-intl, and React PDF patterns.
- Treat /api/generate-pdf as the active PDF path; the HTML print route is legacy.

Cycle objective:
1. Inspect git status, recent failures, TODO/FIXME comments, test gaps, and obvious UX/performance friction.
2. Pick one improvement with clear user or maintenance value.
3. Delegate independent thread tasks when useful:
   - Code quality: concrete ownership and expected changed files.
   - Speed: concrete ownership and measurement/verification command.
   - UX: concrete ownership and screenshot or Playwright check.
   - Critic: review the final diff and identify reasons not to ship.
4. Implement only the selected improvement.
5. Run the smallest meaningful verification first, then broaden if risk justifies it.
6. Criticize your own diff before finishing: what could regress, what remains unproven, and what should wait.

Final output:
- Changed files.
- Verification commands and results.
- Self-critique.
- Whether this cycle is deployable.
```

## Thread Prompts

### Code Quality

```text
Audit only your assigned area for code quality and maintainability. Do not edit outside that ownership area. Preserve other edits. Return concrete findings with file paths, recommended changes, tests to run, and risk. If asked to implement, make a small patch and list changed files.
```

### Speed

```text
Audit only your assigned area for performance or CI speed. Look for unnecessary re-renders, avoidable client work, oversized dependencies, slow tests, or deployment friction. Recommend measurable changes and the command or trace that proves the result. If asked to implement, keep the patch narrow.
```

### UX

```text
Audit only your assigned user flow for usability, accessibility, responsive layout, and interaction friction. Prefer changes that make the app easier to operate without adding instructional text. Include expected screenshot or Playwright checks. If asked to implement, keep styling consistent with the existing UI system.
```

### Critic

```text
Review the final diff as a release blocker. Lead with bugs, regressions, missing tests, deployment risk, and user-facing issues. Be strict. If there are no blockers, say what residual risk remains and which verification commands passed.
```

## Two-Hour Deployment Gate

Run the full gate before pushing to production:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
git diff --check
git status --short
```

The unattended production loop commits and deploys only when:

- The current branch is `main`.
- The branch is not behind its upstream.
- The worktree changes were produced by the loop after a clean start.
- All gate commands pass.
- The critic thread has no release blockers.
- No protected `.env*` files other than `.env.example` are modified or untracked.
- The deployment path is available. This repo deploys production from `main` through `.github/workflows/vercel-deploy.yml`.

Deploy command:

```bash
git push origin main
```

## Self-Critique Checklist

- Did this cycle improve a real user or maintainer pain point?
- Is the change smaller than the verification surface?
- Did any thread touch overlapping files unnecessarily?
- Are tests proving behavior instead of snapshots of implementation?
- Could the production deploy fail because local tooling differs from CI?
- What is the rollback path if this ships poorly?
