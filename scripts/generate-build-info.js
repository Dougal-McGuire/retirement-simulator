#!/usr/bin/env node

/**
 * Generate build information at build time
 * Captures git commit, tag, build date, and key package versions
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function execSafe(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function getBuildInfo() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  )

  const gitCommit = execSafe('git rev-parse HEAD')
  const gitCommitShort = execSafe('git rev-parse --short HEAD')
  const gitTag = execSafe('git describe --tags --exact-match 2>/dev/null')
  const gitBranch = execSafe('git rev-parse --abbrev-ref HEAD')
  const buildDate = new Date().toISOString()
  const buildNumber = execSafe('git rev-list --count HEAD') || '0'

  const buildInfo = {
    version: packageJson.version,
    buildNumber,
    buildDate,
    git: {
      commit: gitCommit,
      commitShort: gitCommitShort,
      tag: gitTag,
      branch: gitBranch,
    },
    packages: {
      next: packageJson.dependencies.next,
      react: packageJson.dependencies.react,
      'next-intl': packageJson.dependencies['next-intl'],
      typescript: packageJson.devDependencies.typescript,
      tailwindcss: packageJson.devDependencies.tailwindcss,
    },
  }

  return buildInfo
}

function main() {
  const buildInfo = getBuildInfo()
  const outputDir = path.join(__dirname, '..', 'src', 'lib', 'build-info')
  const outputFile = path.join(outputDir, 'build-info.json')

  // Create directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Write build info
  fs.writeFileSync(outputFile, JSON.stringify(buildInfo, null, 2))

  console.log('✅ Build info generated:', outputFile)
  console.log(`   Commit: ${buildInfo.git.commitShort || 'unknown'}`)
  console.log(`   Tag: ${buildInfo.git.tag || 'none'}`)
  console.log(`   Build #${buildInfo.buildNumber}`)
}

main()
