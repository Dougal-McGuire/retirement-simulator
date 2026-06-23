#!/usr/bin/env bash

set -euo pipefail

INTERVAL_SECONDS="${IMPROVEMENT_LOOP_INTERVAL_SECONDS:-600}"
DEPLOY_INTERVAL_SECONDS="${IMPROVEMENT_LOOP_DEPLOY_INTERVAL_SECONDS:-7200}"
RUNS_DIR="${IMPROVEMENT_LOOP_RUNS_DIR:-.improvement-loop}"
CODEX_MODEL="${IMPROVEMENT_LOOP_CODEX_MODEL:-gpt-5.5}"
MODE="loop"
DEPLOY="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --once)
      MODE="once"
      shift
      ;;
    --deploy)
      DEPLOY="true"
      shift
      ;;
    --interval)
      INTERVAL_SECONDS="$2"
      shift 2
      ;;
    --deploy-interval)
      DEPLOY_INTERVAL_SECONDS="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNS_PATH="$ROOT_DIR/$RUNS_DIR"
LAST_DEPLOY_CHECK="$(date +%s)"
CYCLE_NUMBER=0

has_changes() {
  [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]
}

require_clean_start() {
  if has_changes && [[ "${IMPROVEMENT_LOOP_ALLOW_DIRTY:-0}" != "1" ]]; then
    cat >&2 <<'MSG'
Refusing to start unattended automation because the worktree is dirty.
Commit, stash, or review the existing work first, or set IMPROVEMENT_LOOP_ALLOW_DIRTY=1.
MSG
    git -C "$ROOT_DIR" status --short >&2
    exit 1
  fi
}

ensure_deploy_ready() {
  if [[ "$DEPLOY" != "true" ]]; then
    return
  fi

  if [[ "$(git -C "$ROOT_DIR" branch --show-current)" != "main" ]]; then
    echo "Refusing unattended deploy loop: current branch is not main." >&2
    exit 1
  fi

  if ! git -C "$ROOT_DIR" config user.name >/dev/null; then
    echo "Refusing unattended deploy loop: git user.name is not configured." >&2
    exit 1
  fi

  if ! git -C "$ROOT_DIR" config user.email >/dev/null; then
    echo "Refusing unattended deploy loop: git user.email is not configured." >&2
    exit 1
  fi

  if ! git -C "$ROOT_DIR" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    echo "Refusing unattended deploy loop: main has no upstream tracking branch." >&2
    exit 1
  fi
}

write_audit_prompt() {
  local name="$1"
  local prompt_file="$2"

  case "$name" in
    code-quality)
      cat >"$prompt_file" <<'PROMPT'
You are the code-quality audit thread for /home/wrichter/projects/retirement-simulator.

Read AGENTS.md first. Do not edit files. Inspect the current repo state and identify one or two low-risk improvements that would improve maintainability, type safety, tests, or consistency. Avoid UX and performance-only findings. Return concrete file paths, recommended changes, verification commands, and risks. Keep it short and actionable.
PROMPT
      ;;
    speed)
      cat >"$prompt_file" <<'PROMPT'
You are the speed audit thread for /home/wrichter/projects/retirement-simulator.

Read AGENTS.md first. Do not edit files. Inspect the current repo state and identify one or two low-risk improvements that would improve runtime speed, simulation performance, build/test speed, bundle health, or deployment reliability. Return concrete file paths, recommended changes, measurement or verification commands, and risks. Keep it short and actionable.
PROMPT
      ;;
    ux)
      cat >"$prompt_file" <<'PROMPT'
You are the UX/accessibility audit thread for /home/wrichter/projects/retirement-simulator.

Read AGENTS.md first. Do not edit files. Inspect the setup and simulation flows for one or two low-risk usability, accessibility, responsiveness, or copy improvements. Prefer changes that reduce friction without adding explanatory clutter. Return concrete file paths, recommended changes, screenshot or Playwright checks, and risks. Keep it short and actionable.
PROMPT
      ;;
    *)
      echo "Unknown audit thread: $name" >&2
      exit 2
      ;;
  esac
}

codex_exec() {
  local sandbox="$1"
  local prompt_file="$2"
  local output_file="$3"
  local log_file="$4"

  pnpm exec codex \
    -m "$CODEX_MODEL" \
    -a never \
    --sandbox "$sandbox" \
    exec \
    -C "$ROOT_DIR" \
    -o "$output_file" \
    - <"$prompt_file" >"$log_file" 2>&1
}

run_codex_preflight() {
  local preflight_dir="$RUNS_PATH/preflight"
  mkdir -p "$preflight_dir"

  cat >"$preflight_dir/prompt.md" <<'PROMPT'
Reply with exactly: improvement-loop-preflight-ok
PROMPT

  codex_exec read-only \
    "$preflight_dir/prompt.md" \
    "$preflight_dir/report.md" \
    "$preflight_dir/log"
}

run_audit_threads() {
  local run_dir="$1"
  local -a names=("code-quality" "speed" "ux")
  local -a pids=()

  for name in "${names[@]}"; do
    write_audit_prompt "$name" "$run_dir/$name.prompt.md"
    codex_exec read-only "$run_dir/$name.prompt.md" "$run_dir/$name.report.md" "$run_dir/$name.log" &
    pids+=("$!")
  done

  local failed=0
  for pid in "${pids[@]}"; do
    if ! wait "$pid"; then
      failed=1
    fi
  done

  if [[ "$failed" != "0" ]]; then
    echo "One or more audit threads failed. See $run_dir/*.log." >&2
    exit 1
  fi
}

write_worker_prompt() {
  local run_dir="$1"
  local prompt_file="$2"

  cat >"$prompt_file" <<PROMPT
You are the implementation worker thread for /home/wrichter/projects/retirement-simulator.

Read AGENTS.md first. You are not alone in the codebase: preserve existing changes and never revert work you did not make. Do not commit or push. Pick exactly one narrow improvement from the audit reports below, implement it directly, and run meaningful verification. If there is no safe improvement, do not edit files.

Rules:
- Keep the patch small enough for an unattended 10-minute cycle.
- Prefer existing Next.js, React, Tailwind, Jest, Playwright, Zustand, next-intl, and React PDF patterns.
- Treat /api/generate-pdf as the active PDF path; the HTML print route is legacy.
- Do not make broad refactors, dependency upgrades, or visual redesigns in this worker pass.
- Finish with changed files, verification results, self-critique, and exactly one final marker:
  WORKER_DECISION: CHANGED
  WORKER_DECISION: NO_CHANGE
  WORKER_DECISION: BLOCKED

Code-quality audit:
$(cat "$run_dir/code-quality.report.md")

Speed audit:
$(cat "$run_dir/speed.report.md")

UX/accessibility audit:
$(cat "$run_dir/ux.report.md")
PROMPT
}

run_worker_thread() {
  local run_dir="$1"

  write_worker_prompt "$run_dir" "$run_dir/worker.prompt.md"
  codex_exec workspace-write "$run_dir/worker.prompt.md" "$run_dir/worker.report.md" "$run_dir/worker.log"
}

write_critic_prompt() {
  local run_dir="$1"
  local prompt_file="$2"
  local scope="$3"

  cat >"$prompt_file" <<PROMPT
You are the critic thread for /home/wrichter/projects/retirement-simulator.

Read AGENTS.md first. Do not edit files. Review the current working-tree diff as a release blocker for this $scope. Lead with bugs, regressions, missing tests, deployment risks, or reasons not to ship. If there are no blockers, say so. Finish with exactly one final marker:
RELEASE_DECISION: PASS
RELEASE_DECISION: FAIL

Worker report:
$(cat "$run_dir/worker.report.md" 2>/dev/null || true)
PROMPT
}

run_critic_thread() {
  local run_dir="$1"
  local scope="$2"

  write_critic_prompt "$run_dir" "$run_dir/critic-$scope.prompt.md" "$scope"
  codex_exec read-only "$run_dir/critic-$scope.prompt.md" "$run_dir/critic-$scope.report.md" "$run_dir/critic-$scope.log"

  if ! grep -q '^RELEASE_DECISION: PASS$' "$run_dir/critic-$scope.report.md"; then
    echo "Critic blocked the $scope. See $run_dir/critic-$scope.report.md." >&2
    exit 1
  fi
}

run_cycle_validation_gate() {
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
  git -C "$ROOT_DIR" diff --check
}

run_deploy_gate() {
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
  pnpm test:e2e
  git -C "$ROOT_DIR" diff --check
}

run_cycle() {
  CYCLE_NUMBER=$((CYCLE_NUMBER + 1))

  local run_id
  run_id="$(date -u +%Y%m%dT%H%M%SZ)-cycle-$CYCLE_NUMBER"
  local run_dir="$RUNS_PATH/$run_id"
  mkdir -p "$run_dir"

  echo "[$(date -Is)] Starting improvement cycle $CYCLE_NUMBER ($run_dir)"
  run_audit_threads "$run_dir"
  run_worker_thread "$run_dir"

  if has_changes; then
    run_critic_thread "$run_dir" cycle
    run_cycle_validation_gate

    if [[ "$DEPLOY" != "true" ]]; then
      cat >&2 <<'MSG'
Cycle produced changes. Review and commit them before starting the next automated cycle.
MSG
      git -C "$ROOT_DIR" status --short >&2
      exit 0
    fi
  fi
}

maybe_commit_and_deploy() {
  local now
  now="$(date +%s)"

  if [[ "$DEPLOY" != "true" ]]; then
    return
  fi

  if (( now - LAST_DEPLOY_CHECK < DEPLOY_INTERVAL_SECONDS )); then
    return
  fi

  LAST_DEPLOY_CHECK="$now"

  if ! has_changes; then
    echo "[$(date -Is)] Two-hour deploy gate reached; no changes to commit or deploy."
    return
  fi

  local run_id
  run_id="$(date -u +%Y%m%dT%H%M%SZ)-deploy"
  local run_dir="$RUNS_PATH/$run_id"
  mkdir -p "$run_dir"

  echo "[$(date -Is)] Two-hour deploy gate reached; validating, committing, and pushing."
  run_critic_thread "$run_dir" deploy
  run_deploy_gate

  git -C "$ROOT_DIR" add -A
  if git -C "$ROOT_DIR" diff --cached --quiet; then
    echo "[$(date -Is)] No staged changes after validation."
    return
  fi

  git -C "$ROOT_DIR" commit -m "${IMPROVEMENT_LOOP_COMMIT_MESSAGE:-Automated improvement loop cycle}"
  git -C "$ROOT_DIR" push origin main
}

main() {
  cd "$ROOT_DIR"
  mkdir -p "$RUNS_PATH"
  require_clean_start
  ensure_deploy_ready
  run_codex_preflight

  while true; do
    run_cycle
    maybe_commit_and_deploy

    if [[ "$MODE" == "once" ]]; then
      break
    fi

    echo "[$(date -Is)] Sleeping for $INTERVAL_SECONDS seconds."
    sleep "$INTERVAL_SECONDS"
  done
}

main
