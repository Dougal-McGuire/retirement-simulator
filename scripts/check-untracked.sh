#!/usr/bin/env bash
# Refuses (exit 1) when the working tree has untracked files outside the
# directories that normally gain new files. `git add -A` in `make deploy` and
# the improvement loop would otherwise commit stray logs, scratch notes and
# probe scripts straight to main (that is how build.log, scratchpad.txt and
# friends got in).
#
# Override the allow-list with UNTRACKED_ALLOW='^(src|tests)/' if needed.
set -euo pipefail

root="${1:-$(git rev-parse --show-toplevel)}"
allow="${UNTRACKED_ALLOW:-^(src|tests|public|docs|scripts|\.github)/}"

stray="$(git -C "$root" ls-files --others --exclude-standard | grep -Ev "$allow" || true)"
if [[ -n "$stray" ]]; then
  echo "Refusing: untracked files outside ${allow} would be committed:" >&2
  sed 's/^/  /' <<<"$stray" >&2
  echo "Delete them, add them to .gitignore, or 'git add' them yourself first." >&2
  exit 1
fi
