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

3. **Usage**: The `VersionInfo` component displays this information when the info icon is clicked in the header

## Viewing Version Info

In the application, click the info icon (ℹ️) next to the simulation badges in the header to see a toast with:
- Version number
- Build number
- Build date
- Git commit hash
- Git tag (if available)
- Key package versions

## Development

The `build-info.json` file is:
- **Generated** at build/dev time by the script
- **Ignored** by git (.gitignore)
- **Required** for the app to run (imported by VersionInfo component)

If you see an error about missing `build-info.json`, run:
```bash
node scripts/generate-build-info.js
```
