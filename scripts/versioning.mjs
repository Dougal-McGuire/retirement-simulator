#!/usr/bin/env node
/**
 * CalVer release versioning (YYYY.MM.N) matching the house standard across repos.
 *
 * Commands:
 *   next-tag               Print the next YYYY.MM.N tag for the current UTC month
 *   tag [--tag T] [--push] Ensure HEAD has an annotated YYYY.MM.N release tag
 *   resolve                Print JSON { version, gitSha, deployedAt } for HEAD
 */

import { execFileSync } from 'node:child_process'

export const RELEASE_TAG_PATTERN = /^\d{4}\.\d{2}\.\d+$/

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function tryGit(args) {
  try {
    return git(args)
  } catch {
    return ''
  }
}

export function tagsAtHead() {
  const out = tryGit(['tag', '--points-at', 'HEAD'])
  return out
    ? out
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .sort()
    : []
}

export function allTags() {
  const out = tryGit(['tag', '--list'])
  return out
    ? out
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : []
}

export function headReleaseTag() {
  const matches = tagsAtHead().filter((tag) => RELEASE_TAG_PATTERN.test(tag))
  return matches.length === 1 ? matches[0] : null
}

export function nextReleaseTag(now = new Date(), existingTags = allTags()) {
  const year = String(now.getUTCFullYear()).padStart(4, '0')
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const prefix = `${year}.${month}.`
  let maxCounter = 0
  for (const tag of existingTags) {
    if (tag.startsWith(prefix) && RELEASE_TAG_PATTERN.test(tag)) {
      const counter = Number(tag.slice(prefix.length))
      if (Number.isInteger(counter) && counter > maxCounter) maxCounter = counter
    }
  }
  return `${prefix}${maxCounter + 1}`
}

function ensureCleanWorktree() {
  const status = git(['status', '--porcelain', '--untracked-files=no'])
  if (status) {
    throw new Error('Git worktree has uncommitted tracked changes')
  }
}

function createReleaseTag(explicitTag) {
  const existing = headReleaseTag()
  if (existing) {
    const type = git(['cat-file', '-t', `refs/tags/${existing}`])
    if (type !== 'tag') {
      throw new Error(`HEAD has a lightweight release tag (${existing}); expected an annotated tag`)
    }
    return existing
  }
  const tag = explicitTag || nextReleaseTag()
  if (!RELEASE_TAG_PATTERN.test(tag)) {
    throw new Error(`Invalid release tag name: ${tag} (expected YYYY.MM.N)`)
  }
  git(['tag', '-a', tag, '-m', `Release ${tag}`])
  return tag
}

function main(argv) {
  const [command, ...rest] = argv
  if (command === 'next-tag') {
    console.log(nextReleaseTag())
    return
  }
  if (command === 'tag') {
    ensureCleanWorktree()
    const tagFlagIndex = rest.indexOf('--tag')
    const explicitTag = tagFlagIndex >= 0 ? rest[tagFlagIndex + 1] : undefined
    const push = rest.includes('--push')
    const tag = createReleaseTag(explicitTag)
    console.log(tag)
    if (push) git(['push', 'origin', tag])
    return
  }
  if (command === 'resolve') {
    const version = headReleaseTag() ?? 'dev'
    const gitSha = tryGit(['rev-parse', 'HEAD'])
    const deployedAt = new Date().toISOString()
    console.log(JSON.stringify({ version, gitSha, deployedAt }))
    return
  }
  console.error('Usage: node scripts/versioning.mjs <next-tag|tag [--tag YYYY.MM.N] [--push]|resolve>')
  process.exit(2)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
