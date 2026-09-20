import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export type SkillManifestEntry = {
  name: string
  delivery?: "http-with-baseline" | "bundled"
  catalogDescription: string
  repo: string
  path: string
  license?: string
  localCandidates?: string[]
  excludes?: string[]
}

export type SkillsManifest = {
  version: number
  defaultExcludes?: string[]
  skills: SkillManifestEntry[]
}

export type SkillLockEntry = {
  name: string
  repo: string
  commit: string
  path: string
  skillMdSha256: string
}

export type SkillsLock = {
  version: number
  skills: SkillLockEntry[]
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
export const packageDir = path.resolve(scriptDir, "..")
export const repoRoot = path.resolve(packageDir, "../..")
export const configDir = path.join(packageDir, "resources", "gridy-config")
export const skillsDir = path.join(configDir, "skills")
export const manifestPath = path.join(configDir, "skills.manifest.json")
export const lockPath = path.join(configDir, "skills.lock.json")
export const cacheRoot = path.join(packageDir, ".cache", "gridy-skills")

const textExtensions = new Set([
  ".inp",
  ".java",
  ".json",
  ".lock",
  ".md",
  ".ps1",
  ".py",
  ".toml",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
])

export function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T
}

export function writeJson(filePath: string, value: unknown) {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8")
}

export function normalizeText(text: string) {
  return (
    text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+(?=\n|$)/g, "")
      .replace(/[ \t\n]+$/g, "") + "\n"
  )
}

export function sha256(content: string | Buffer) {
  return createHash("sha256").update(content).digest("hex")
}

export function normalizedFileSha256(filePath: string) {
  return sha256(normalizeText(readFileSync(filePath, "utf8")))
}

export function runGit(cwd: string, args: string[], options?: { allowFailure?: boolean }) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (result.status !== 0 && !options?.allowFailure) {
    const detail = (result.stderr || result.stdout || "").trim()
    throw new Error(`git ${args.join(" ")} failed in ${cwd}${detail ? `: ${detail}` : ""}`)
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  }
}

export function repoRootFor(candidate: string) {
  const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(repoRoot, candidate)
  if (!existsSync(resolved)) return undefined
  const result = runGit(resolved, ["rev-parse", "--show-toplevel"], { allowFailure: true })
  return result.ok ? path.resolve(result.stdout) : undefined
}

export function assertInside(child: string, parent: string, label: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return
  throw new Error(`${label} resolved outside ${parent}: ${child}`)
}

export function skillNameFromFrontmatter(skillText: string) {
  const match = skillText.match(/^name:\s*["']?([^"'\r\n]+)["']?\s*$/m)
  return match?.[1]?.trim()
}

export function validateSkillFile(sourceDir: string, expectedName: string, expectedSha?: string) {
  const skillFile = path.join(sourceDir, "SKILL.md")
  if (!existsSync(skillFile)) throw new Error(`Missing SKILL.md for ${expectedName}: ${sourceDir}`)
  const skillText = readFileSync(skillFile, "utf8")
  const frontmatterName = skillNameFromFrontmatter(skillText)
  if (frontmatterName !== expectedName) {
    throw new Error(`Skill frontmatter name mismatch for ${expectedName}: ${frontmatterName ?? "<missing>"}`)
  }
  const actualSha = normalizedFileSha256(skillFile)
  if (expectedSha && actualSha !== expectedSha) {
    throw new Error(`SKILL.md sha256 mismatch for ${expectedName}: expected ${expectedSha}, got ${actualSha}`)
  }
  return actualSha
}

export function setCatalogDescription(skillDir: string, description: string) {
  const value = description.trim()
  if (!value || /[\r\n]/.test(value)) throw new Error(`Invalid catalog description for ${skillDir}`)

  const skillFile = path.join(skillDir, "SKILL.md")
  const skillText = readFileSync(skillFile, "utf8")
  const frontmatterEnd = skillText.indexOf("\n---", 4)
  if (!skillText.startsWith("---\n") || frontmatterEnd === -1) {
    throw new Error(`Missing YAML frontmatter in ${skillFile}`)
  }

  const frontmatter = skillText.slice(0, frontmatterEnd)
  const lines = frontmatter.split("\n")
  const start = lines.findIndex((line) => /^description\s*:/.test(line))
  if (start === -1) throw new Error(`Missing description in ${skillFile}`)

  const scalar = lines[start].slice(lines[start].indexOf(":") + 1).trim()
  let end = start + 1
  if (/^[>|][+-]?\d*$/.test(scalar)) {
    while (end < lines.length && (lines[end].trim() === "" || /^[ \t]+/.test(lines[end]))) end++
  }
  lines.splice(start, end - start, `description: ${JSON.stringify(value)}`)

  const updatedFrontmatter = lines.join("\n")
  const serializedDescription = updatedFrontmatter.match(/^description:\s*(".*")$/m)?.[1]
  if (!serializedDescription || JSON.parse(serializedDescription) !== value) {
    throw new Error(`Failed to set catalog description in ${skillFile}`)
  }
  const updated = `${updatedFrontmatter}${skillText.slice(frontmatterEnd)}`
  writeFileSync(skillFile, normalizeText(updated), "utf8")
}

export function resolveLocalSource(entry: SkillManifestEntry, lock: SkillLockEntry) {
  for (const candidate of entry.localCandidates ?? []) {
    const root = repoRootFor(candidate)
    if (!root) continue

    const head = runGit(root, ["rev-parse", "HEAD"]).stdout
    if (head !== lock.commit) {
      console.warn(`[skills] ${entry.name}: skip local ${root}; HEAD ${head} != lock ${lock.commit}`)
      continue
    }

    const status = runGit(root, ["status", "--porcelain", "--", entry.path]).stdout
    if (status) {
      console.warn(`[skills] ${entry.name}: skip dirty local source ${root}/${entry.path}`)
      continue
    }

    const sourceDir = path.join(root, entry.path)
    if (existsSync(path.join(sourceDir, "SKILL.md"))) return sourceDir
  }
  return undefined
}

export function ensureCachedRepo(repo: string, commit: string, offline: boolean) {
  if (offline)
    throw new Error(`GRIDY_SKILLS_OFFLINE is set and no matching local checkout is available for ${repo}@${commit}`)

  mkdirSync(cacheRoot, { recursive: true })
  const safeRepo = repo.replace(/[^A-Za-z0-9_.-]+/g, "_")
  const checkoutDir = path.join(cacheRoot, safeRepo, commit)
  if (existsSync(checkoutDir) && !existsSync(path.join(checkoutDir, ".git"))) {
    assertInside(checkoutDir, cacheRoot, "cache checkout")
    rmSync(checkoutDir, { recursive: true, force: true })
  }

  if (!existsSync(path.join(checkoutDir, ".git"))) {
    mkdirSync(path.dirname(checkoutDir), { recursive: true })
    runGit(path.dirname(checkoutDir), ["clone", "--no-checkout", `https://github.com/${repo}.git`, checkoutDir])
  }

  runGit(checkoutDir, ["fetch", "origin", commit, "--depth=1"])
  runGit(checkoutDir, ["checkout", "--force", commit])
  return checkoutDir
}

export function materializedSourceDir(entry: SkillManifestEntry, lock: SkillLockEntry, offline: boolean) {
  const local = resolveLocalSource(entry, lock)
  if (local) return { sourceDir: local, source: "local" }

  const checkout = ensureCachedRepo(entry.repo, lock.commit, offline)
  return { sourceDir: path.join(checkout, entry.path), source: "cache" }
}

function shouldExclude(relativePath: string, excludes: string[]) {
  const parts = relativePath.split(/[\\/]+/).filter(Boolean)
  if (parts.some((part) => excludes.includes(part))) return true
  return path.basename(relativePath).endsWith(".pyc")
}

export function copySkillDirectory(sourceDir: string, destDir: string, excludes: string[], destinationRoot = skillsDir) {
  assertInside(destDir, destinationRoot, "skill destination")
  rmSync(destDir, { recursive: true, force: true })
  mkdirSync(destDir, { recursive: true })

  const copyRecursive = (currentSource: string, currentDest: string, relativeRoot = "") => {
    for (const entry of readdirSync(currentSource, { withFileTypes: true })) {
      const relativePath = path.join(relativeRoot, entry.name)
      if (shouldExclude(relativePath, excludes)) continue

      const from = path.join(currentSource, entry.name)
      const to = path.join(currentDest, entry.name)
      if (entry.isDirectory()) {
        mkdirSync(to, { recursive: true })
        copyRecursive(from, to, relativePath)
        continue
      }
      if (!entry.isFile()) continue

      mkdirSync(path.dirname(to), { recursive: true })
      if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
        writeFileSync(to, normalizeText(readFileSync(from, "utf8")), "utf8")
      } else {
        copyFileSync(from, to)
      }
    }
  }

  copyRecursive(sourceDir, destDir)
}

export function countFiles(root: string) {
  let count = 0
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) walk(full)
      else if (stat.isFile()) count++
    }
  }
  walk(root)
  return count
}

export function copySkillNotices(sourceDir: string, destination: string, entry: SkillManifestEntry, pin: SkillLockEntry) {
  if (!entry.license) throw new Error(`Missing redistribution license: ${entry.name}`)
  const root = runGit(sourceDir, ["rev-parse", "--show-toplevel"]).stdout
  const notices = runGit(root, ["ls-tree", "--name-only", pin.commit]).stdout.split("\n")
    .filter((name) => /^(LICENSE(?:[-.].*)?|NOTICE(?:\..*)?)$/i.test(name))
  for (const name of notices) {
    const content = runGit(root, ["show", `${pin.commit}:${name}`]).stdout + "\n"
    writeFileSync(path.join(destination, `SOURCE-${name}`), content)
  }
  if (!notices.some((name) => /^LICENSE(?:\..*)?$/i.test(name)) && !existsSync(path.join(destination, "LICENSE")))
    throw new Error(`Missing license text at pinned revision: ${entry.name}`)
  writeJson(path.join(destination, "SOURCE.json"), { ...pin, license: entry.license })
}

export function loadManifestAndLock() {
  const manifest = readJson<SkillsManifest>(manifestPath)
  const lock = readJson<SkillsLock>(lockPath)
  return { manifest, lock }
}

export function findLockEntry(lock: SkillsLock, entry: SkillManifestEntry) {
  return lock.skills.find((item) => item.name === entry.name && item.repo === entry.repo && item.path === entry.path)
}
