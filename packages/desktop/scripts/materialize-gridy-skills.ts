#!/usr/bin/env bun
import path from "node:path"
import { mkdirSync, readFileSync, rmSync } from "node:fs"

import {
  copySkillDirectory,
  copySkillNotices,
  configDir,
  countFiles,
  findLockEntry,
  loadManifestAndLock,
  materializedSourceDir,
  setCatalogDescription,
  skillsDir,
  validateSkillFile,
} from "./gridy-skills"
import { lintResearchBundle } from "./research-bundle-lint"
import { writeCatalog } from "./skill-catalog-build"

const offline = /^(1|true|yes)$/i.test(process.env.GRIDY_SKILLS_OFFLINE ?? "")
const { manifest, lock } = loadManifestAndLock()

rmSync(skillsDir, { recursive: true, force: true })
mkdirSync(skillsDir, { recursive: true })
const baselineDir = path.join(configDir, "skill-baseline")
if (path.dirname(baselineDir) !== configDir) throw new Error("Invalid baseline directory")
rmSync(baselineDir, { recursive: true, force: true })
mkdirSync(baselineDir, { recursive: true })

const catalogDescriptionChars = manifest.skills.reduce((total, entry) => total + entry.catalogDescription.length, 0)
if (catalogDescriptionChars > 7_500) {
  throw new Error(`Skill catalog descriptions exceed 7,500 characters: ${catalogDescriptionChars}`)
}

const rows: Array<{ name: string; source: string; files: number; descriptionChars: number }> = []
for (const entry of manifest.skills) {
  const lockEntry = findLockEntry(lock, entry)
  if (!lockEntry) throw new Error(`Missing skills.lock.json entry for ${entry.name}`)

  const excludes = [...(manifest.defaultExcludes ?? []), ...(entry.excludes ?? [])]
  const resolved = materializedSourceDir(entry, lockEntry, offline)
  validateSkillFile(resolved.sourceDir, entry.name, lockEntry.skillMdSha256)

  const destinationRoot = entry.delivery === "http-with-baseline" ? baselineDir : skillsDir
  const destDir = path.join(destinationRoot, entry.name)
  copySkillDirectory(resolved.sourceDir, destDir, excludes, destinationRoot)
  copySkillNotices(resolved.sourceDir, destDir, entry, lockEntry)
  setCatalogDescription(destDir, entry.catalogDescription)
  validateSkillFile(destDir, entry.name)
  rows.push({
    name: entry.name,
    source: resolved.source,
    files: countFiles(destDir),
    descriptionChars: entry.catalogDescription.length,
  })
}

writeCatalog(
  baselineDir,
  manifest.skills.filter((entry) => entry.delivery === "http-with-baseline").map((entry) => entry.name),
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version,
)
lintResearchBundle()
console.table(rows)
console.log(`[skills] catalog descriptions: ${catalogDescriptionChars}/7500 characters`)
