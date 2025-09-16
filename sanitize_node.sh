#!/usr/bin/env bash
# node-wsl-clean.sh
set -euo pipefail

note(){ printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m!!\033[0m %s\n' "$*"; }

# 0) Sanity: WSL?
if ! grep -qi microsoft /proc/version 2>/dev/null; then
  warn "Not WSL. Continue anyway."
fi

SHELLS=("$HOME/.zshrc" "$HOME/.bashrc")
backup_rc(){ for f in "${SHELLS[@]}"; do [ -f "$f" ] && cp -n "$f" "$f.bak.node-clean.$(date +%s)" || true; done; }

# 1) Kill conflicting managers and system nodes
note "Removing fnm shims and config"
rm -rf "$HOME/.local/share/fnm" 2>/dev/null || true
find "/run/user/$(id -u)" -maxdepth 1 -type d -name 'fnm_multishells*' -exec rm -rf {} + 2>/dev/null || true

note "Removing Volta"
rm -rf "$HOME/.volta" 2>/dev/null || true

note "Removing legacy Yarn and pnpm global installs (npm globals)"
if command -v npm >/dev/null 2>&1; then
  npm rm -g pnpm yarn 2>/dev/null || true
fi

note "Purging apt packages if present (sudo required)"
if command -v apt >/dev/null 2>&1; then
  sudo apt -y purge nodejs npm yarncmd yarnpkg yarn 2>/dev/null || true
  sudo apt -y autoremove 2>/dev/null || true
fi

note "Homebrew on Linux (if any): uninstall node"
if command -v brew >/dev/null 2>&1; then
  brew list node >/dev/null 2>&1 && brew uninstall --ignore-dependencies node || true
fi

# 2) Clean PATH for this session
note "Sanitizing PATH for this session"
sanitize_path() {
  awk -v RS=: -v ORS=: '
  {
    bad = ($0 ~ /fnm_multishells/ \
        || $0 ~ /\/\.local\/share\/fnm/ \
        || $0 ~ /\/\.volta/ \
        || $0 ~ /\/_dev\/nvm/ \
        || $0 ~ /\/nvm4w\/nodejs/ \
        || $0 ~ /\/Program Files\/nodejs/ \
        || $0 ~ /\/Roaming\/npm/ \
        || $0 ~ /\/Scoop\/apps\/node/ \
        || $0 ~ /\/nvs\// \
        || $0 ~ /\/Nodist\// \
        || $0 ~ /\/pnpm\/?$/ \
        || $0 ~ /\/yarn\/?$/ )
    if (!bad && !seen[$0] && length($0)>0) { print $0; seen[$0]=1 }
  }' <<<"$PATH" | sed 's/:$//'
}
export PATH="$(sanitize_path)"

# 3) Edit shell rc files: remove conflicting init, add nvm + PATH guard
backup_rc
note "Rewriting shell init to prefer nvm and sanitize PATH"

insert_block='
# >>> node-cleanup managed start
# Remove known conflicting Node manager paths every login
sanitize_node_path() {
  awk -v RS=: -v ORS=: '"'"'
  {
    bad = ($0 ~ /fnm_multishells/ \
        || $0 ~ /\/\.local\/share\/fnm/ \
        || $0 ~ /\/\.volta/ \
        || $0 ~ /\/_dev\/nvm/ \
        || $0 ~ /\/nvm4w\/nodejs/ \
        || $0 ~ /\/Program Files\/nodejs/ \
        || $0 ~ /\/Roaming\/npm/ \
        || $0 ~ /\/Scoop\/apps\/node/ \
        || $0 ~ /\/nvs\// \
        || $0 ~ /\/Nodist\// )
    if (!bad && !seen[$0] && length($0)>0) { print $0; seen[$0]=1 }
  }'"'"' <<<"$PATH" | sed "s/:$//"
}
export PATH="$(sanitize_node_path)"

# nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Auto-use project .nvmrc on cd
if [ -n "$ZSH_VERSION" ]; then
  autoload -U add-zsh-hook 2>/dev/null || true
  use-nvmrc() { [ -f .nvmrc ] && nvm use >/dev/null || true; }
  add-zsh-hook chpwd use-nvmrc 2>/dev/null || true
  use-nvmrc
else
  cd() { builtin cd "$@"; [ -f .nvmrc ] && nvm use >/dev/null || true; }
fi
# <<< node-cleanup managed end
'

for f in "${SHELLS[@]}"; do
  [ -f "$f" ] || continue
  # Comment out conflicting lines
  sed -i \
    -e 's/^\(.*fnm env.*\)$/# \1 # disabled by node-cleanup/' \
    -e 's|^\(export PATH="$HOME/.local/share/fnm:.*\)$|# \1 # disabled by node-cleanup|' \
    -e 's/^\(.*volta.*\)$/# \1 # disabled by node-cleanup/' \
    -e 's|^\(export NPM_CONFIG_PREFIX=.*\)$|# \1 # disabled by node-cleanup|' \
    "$f"
  # Remove old managed block if present, then append fresh
  awk '
    BEGIN{skip=0}
    /# >>> node-cleanup managed start/{skip=1}
    !skip{print}
    /# <<< node-cleanup managed end/{skip=0}
  ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  printf "%s\n" "$insert_block" >> "$f"
done

# 4) Ensure nvm present; install Node 22; set default
note "Ensuring nvm is available"
if ! command -v nvm >/dev/null 2>&1; then
  note "Installing nvm"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
fi

note "Installing and selecting Node 22.x via nvm"
nvm install 22 >/dev/null
nvm alias default 22 >/dev/null
nvm use 22

# 5) Corepack + pinned pnpm for this project
if [ -f package.json ]; then
  note "Enabling Corepack and pinning pnpm in package.json"
  corepack enable
  # Pin to latest major 9 line for stability
  npx --yes npm@latest pkg set packageManager="pnpm@latest-9"
  # Migrate lockfile if needed
  if [ -f package-lock.json ] && ! [ -f pnpm-lock.yaml ]; then
    note "Converting package-lock.json to pnpm-lock.yaml"
    pnpm import || true
  fi
  note "Installing deps with pnpm"
  pnpm install
else
  warn "No package.json in $PWD. Skipped project pin/install."
fi

# 6) Verify
note "Verification"
type -a node || true
echo "node: $(command -v node)"
echo "npm:  $(command -v npm)"
echo "pnpm: $(command -v pnpm || echo missing)"
node -v
npm -v
pnpm -v || true

note "Done. Open a new login shell or run: exec \$SHELL -l"
