#!/usr/bin/env bash

set -euo pipefail

INTERVAL_SECONDS="${IMPROVEMENT_LOOP_INTERVAL_SECONDS:-600}"
DEPLOY_INTERVAL_SECONDS="${IMPROVEMENT_LOOP_DEPLOY_INTERVAL_SECONDS:-7200}"
RUNS_DIR="${IMPROVEMENT_LOOP_RUNS_DIR:-.improvement-loop}"
CODEX_MODEL="${IMPROVEMENT_LOOP_CODEX_MODEL:-gpt-5.5}"
RESET_REJECTED_CHANGES="${IMPROVEMENT_LOOP_RESET_REJECTED:-0}"
MODE="loop"
DEPLOY="false"

print_usage() {
  cat <<'USAGE'
Usage: scripts/improvement-loop.sh [options]

Options:
  --once             Run one improvement cycle, then exit.
  --deploy          Enable periodic verified commits and pushes from main.
  --interval N      Seconds between loop cycles. Default: 600.
  --deploy-interval N
                    Seconds between deploy gates when --deploy is enabled.
                    Default: 7200.
  --reset-rejected  Restore legacy behavior: reset rejected changes and continue.
  --help            Show this help.

Environment:
  IMPROVEMENT_LOOP_CODEX_MODEL       Codex model to use. Default: gpt-5.5.
  IMPROVEMENT_LOOP_ALLOW_DIRTY=1     Allow starting from a dirty worktree.
  IMPROVEMENT_LOOP_ALLOW_ENGINE_MISMATCH=1
                                    Warn, instead of fail, when Node/pnpm do
                                    not match package.json engines.
  IMPROVEMENT_LOOP_RESET_REJECTED=1  Reset rejected changes and continue.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help)
      print_usage
      exit 0
      ;;
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
    --reset-rejected)
      RESET_REJECTED_CHANGES="1"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_usage >&2
      exit 2
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNS_PATH="$ROOT_DIR/$RUNS_DIR"
LOCK_DIR="$RUNS_PATH/.lock"
LAST_DEPLOY_CHECK="$(date +%s)"
CYCLE_NUMBER=0

has_changes() {
  [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]
}

has_unpushed_commits() {
  [[ -n "$(git -C "$ROOT_DIR" log --oneline '@{u}..HEAD' 2>/dev/null)" ]]
}

has_protected_env_changes() {
  git -C "$ROOT_DIR" status --porcelain --untracked-files=all |
    awk '
      {
        path = substr($0, 4)
        if (path ~ /^\.env($|\.)/ && path != ".env.example") {
          found = 1
        }
      }
      END { exit found ? 0 : 1 }
    '
}

print_protected_env_changes() {
  git -C "$ROOT_DIR" status --porcelain --untracked-files=all |
    awk '
      {
        path = substr($0, 4)
        if (path ~ /^\.env($|\.)/ && path != ".env.example") {
          print
        }
      }
    '
}

require_command() {
  local name="$1"

  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Refusing to start improvement loop: required command '$name' is not available." >&2
    exit 1
  fi
}

check_package_engines() {
  node <<'NODE'
const fs = require('fs')

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const nodeEngine = pkg.engines && pkg.engines.node
const pnpmEngine = pkg.engines && pkg.engines.pnpm
const pnpmVersion = process.env.IMPROVEMENT_LOOP_PNPM_VERSION || ''
const allowMismatch = process.env.IMPROVEMENT_LOOP_ALLOW_ENGINE_MISMATCH === '1'
const warnings = []

function parseVersion(version) {
  const match = String(version).trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!match) return null

  return [
    Number(match[1]),
    Number(match[2] || 0),
    Number(match[3] || 0),
  ]
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return 1
    if (left[index] < right[index]) return -1
  }

  return 0
}

function satisfiesComparator(version, comparator) {
  const match = comparator.match(/^(>=|>|<=|<|=)?v?(\d+(?:\.\d+){0,2})$/)
  if (!match) {
    throw new Error(`Unsupported engine comparator: ${comparator}`)
  }

  const operator = match[1] || '='
  const expected = parseVersion(match[2])
  const comparison = compareVersions(version, expected)

  switch (operator) {
    case '>=':
      return comparison >= 0
    case '>':
      return comparison > 0
    case '<=':
      return comparison <= 0
    case '<':
      return comparison < 0
    case '=':
      return comparison === 0
    default:
      throw new Error(`Unsupported engine operator: ${operator}`)
  }
}

function satisfiesRange(versionString, range) {
  if (!range) return true

  const version = parseVersion(versionString)
  if (!version) {
    throw new Error(`Unsupported version: ${versionString}`)
  }

  return String(range)
    .split('||')
    .some((group) => {
      const comparators = group.trim().split(/\s+/).filter(Boolean)
      return comparators.length > 0 &&
        comparators.every((comparator) => satisfiesComparator(version, comparator))
    })
}

if (nodeEngine && !satisfiesRange(process.versions.node, nodeEngine)) {
  warnings.push(`Node ${process.versions.node} does not satisfy ${nodeEngine}`)
}

if (pnpmEngine && !satisfiesRange(pnpmVersion, pnpmEngine)) {
  warnings.push(`pnpm ${pnpmVersion} does not satisfy ${pnpmEngine}`)
}

if (warnings.length > 0) {
  const prefix = allowMismatch ? 'Warning' : 'Refusing to start improvement loop'
  for (const warning of warnings) {
    console.error(`${prefix}: ${warning}.`)
  }
  if (!allowMismatch) {
    console.error('Use the repo Node version, or set IMPROVEMENT_LOOP_ALLOW_ENGINE_MISMATCH=1 to continue anyway.')
    process.exit(1)
  }
}
NODE
}

run_preflight_checks() {
  require_command git
  require_command node
  require_command pnpm

  local pnpm_version
  pnpm_version="$(pnpm --version)"
  IMPROVEMENT_LOOP_PNPM_VERSION="$pnpm_version" check_package_engines
}

acquire_lock() {
  mkdir -p "$RUNS_PATH"

  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "$$" >"$LOCK_DIR/pid"
    trap 'rm -f "$LOCK_DIR/pid"; rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
    return
  fi

  local existing_pid
  existing_pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "Refusing to start improvement loop: another loop is already running as PID $existing_pid." >&2
    exit 1
  fi

  echo "Removing stale improvement-loop lock." >&2
  rm -f "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR" 2>/dev/null || {
    echo "Refusing to start improvement loop: stale lock directory could not be removed: $LOCK_DIR" >&2
    exit 1
  }

  mkdir "$LOCK_DIR"
  echo "$$" >"$LOCK_DIR/pid"
  trap 'rm -f "$LOCK_DIR/pid"; rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
}

ensure_no_protected_env_changes() {
  local context="$1"

  if ! has_protected_env_changes; then
    return
  fi

  echo "Refusing $context because protected env-local files are changed:" >&2
  print_protected_env_changes >&2
  return 1
}

ensure_not_behind_upstream() {
  local upstream
  upstream="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref --symbolic-full-name '@{u}')" || return 1

  if ! git -C "$ROOT_DIR" fetch --quiet; then
    echo "Refusing deploy: failed to fetch upstream before deploy." >&2
    return 1
  fi

  local counts behind
  counts="$(git -C "$ROOT_DIR" rev-list --left-right --count HEAD..."$upstream")" || return 1
  behind="$(awk '{print $2}' <<<"$counts")"

  if (( behind > 0 )); then
    echo "Refusing deploy: current branch is behind $upstream by $behind commit(s). Pull/rebase first." >&2
    return 1
  fi
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
    return 1
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
    return 1
  fi
}

reject_current_changes() {
  local run_dir="$1"
  local reason="$2"

  {
    echo "$reason"
    echo
    git -C "$ROOT_DIR" status --short
  } >"$run_dir/rejected-status.txt"

  if has_changes; then
    git -C "$ROOT_DIR" diff >"$run_dir/rejected.patch"
    git -C "$ROOT_DIR" diff --cached >"$run_dir/rejected-staged.patch"

    if [[ "$RESET_REJECTED_CHANGES" != "1" ]]; then
      cat >&2 <<MSG
[$(date -Is)] Rejected cycle changes: $reason.
The rejected diff was saved in $run_dir/rejected.patch and left in the worktree for manual review.
Set IMPROVEMENT_LOOP_RESET_REJECTED=1 or pass --reset-rejected to restore the legacy reset-and-continue behavior.
MSG
      exit 1
    fi

    git -C "$ROOT_DIR" reset --hard HEAD
    git -C "$ROOT_DIR" clean -fd
  fi

  echo "[$(date -Is)] Rejected cycle changes: $reason. Patch saved in $run_dir."
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
  if ! run_audit_threads "$run_dir"; then
    echo "[$(date -Is)] Skipping cycle $CYCLE_NUMBER after audit thread failure."
    return
  fi

  if ! run_worker_thread "$run_dir"; then
    reject_current_changes "$run_dir" "worker thread failed"
    return
  fi

  if ! ensure_no_protected_env_changes "cycle validation"; then
    reject_current_changes "$run_dir" "worker changed protected env-local files"
    return
  fi

  if has_changes; then
    if ! run_critic_thread "$run_dir" cycle; then
      reject_current_changes "$run_dir" "cycle critic blocked the worker patch"
      return
    fi

    if ! run_cycle_validation_gate >"$run_dir/cycle-validation.log" 2>&1; then
      reject_current_changes "$run_dir" "cycle validation gate failed"
      return
    fi

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

  if ! has_changes && ! has_unpushed_commits; then
    echo "[$(date -Is)] Two-hour deploy gate reached; no changes to commit or deploy."
    return
  fi

  local run_id
  run_id="$(date -u +%Y%m%dT%H%M%SZ)-deploy"
  local run_dir="$RUNS_PATH/$run_id"
  mkdir -p "$run_dir"

  echo "[$(date -Is)] Two-hour deploy gate reached; validating, committing, and pushing."
  if ! ensure_not_behind_upstream; then
    reject_current_changes "$run_dir" "deploy branch is behind upstream"
    return
  fi

  if ! ensure_no_protected_env_changes "deploy"; then
    reject_current_changes "$run_dir" "deploy includes protected env-local files"
    return
  fi

  if ! run_critic_thread "$run_dir" deploy; then
    reject_current_changes "$run_dir" "deploy critic blocked accumulated changes"
    return
  fi

  if ! run_deploy_gate >"$run_dir/deploy-validation.log" 2>&1; then
    reject_current_changes "$run_dir" "deploy validation gate failed"
    return
  fi

  if has_changes; then
    git -C "$ROOT_DIR" add -A
    if git -C "$ROOT_DIR" diff --cached --quiet; then
      echo "[$(date -Is)] No staged changes after validation."
      return
    fi

    git -C "$ROOT_DIR" commit -m "${IMPROVEMENT_LOOP_COMMIT_MESSAGE:-Automated improvement loop cycle}"
  fi

  git -C "$ROOT_DIR" push origin main
}

main() {
  cd "$ROOT_DIR"
  run_preflight_checks
  acquire_lock
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
