# Build Info

This directory contains the build information that is generated at build/dev time.

## How it works

1. **Generation**: The `scripts/generate-build-info.js` script runs before every build and dev server start (via `prebuild` and in `dev` scripts)

2. **Content**: The generated `build-info.json` includes:
   - App version (from package.json)
   - Build number (git commit count)
   - Build date/time
   - Git information (commit hash, tag, branch)
   - Key package versions (Next.js, React, etc.)

3. **Usage**: Nothing in the app imports it at the moment. The header `VersionInfo` popover that used to display it was removed with the workspace redesign; the file is still generated so a future about/diagnostics surface (or a deploy log) can read it.

## Development

The `build-info.json` file is:
- **Generated** at build/dev time by the script
- **Ignored** by git (.gitignore)
- **Not required** at runtime (no module imports it)

To regenerate it manually, run:
```bash
node scripts/generate-build-info.js
```
