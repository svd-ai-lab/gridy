#!/usr/bin/env bun
import path from "node:path"
import { existsSync } from "node:fs"

import {
  type SkillLockEntry,
  type SkillsManifest,
  manifestPath,
  normalizedFileSha256,
  readJson,
  repoRootFor,
  runGit,
  validateSkillFile,
  writeJson,
  lockPath,
} from "./gridy-skills"

const manifest = readJson<SkillsManifest>(manifestPath)
const skills: SkillLockEntry[] = []

for (const entry of manifest.skills) {
  let matchedRoot: string | undefined
  for (const candidate of entry.localCandidates ?? []) {
    const root = repoRootFor(candidate)
    if (root && existsSync(path.join(root, entry.path, "SKILL.md"))) {
      matchedRoot = root
      break
    }
  }
  if (!matchedRoot) throw new Error(`No local checkout found for ${entry.name}; add localCandidates or clone ${entry.repo}`)

  const status = runGit(matchedRoot, ["status", "--porcelain", "--", entry.path]).stdout
  if (status) throw new Error(`Refusing to lock dirty source for ${entry.name}: ${matchedRoot}/${entry.path}`)

  const commit = runGit(matchedRoot, ["rev-parse", "HEAD"]).stdout
  const sourceDir = path.join(matchedRoot, entry.path)
  validateSkillFile(sourceDir, entry.name)
  skills.push({
    name: entry.name,
    repo: entry.repo,
    commit,
    path: entry.path,
    skillMdSha256: normalizedFileSha256(path.join(sourceDir, "SKILL.md")),
  })
}

writeJson(lockPath, { version: 1, skills })
console.log(`Updated ${lockPath}`)
