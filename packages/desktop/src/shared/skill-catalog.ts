import { createHash } from "node:crypto"
import { lstatSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

export type Catalog = {
  schemaVersion: 1
  revision: string
  compatibility: { minAppVersion: string; maxAppVersion?: string }
  skills: { name: string; files: { path: string; sha256: string; bytes: number }[] }[]
}

export const MAX_CATALOG_BYTES = 32 * 1024 * 1024
export const MAX_DOWNLOAD_BYTES = 16 * 1024 * 1024
export const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
export const isDigest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)

export function safePath(value: string) {
  return (
    typeof value === "string" &&
    value.length < 240 &&
    value
      .split("/")
      .every(
        (part) =>
          /^[a-zA-Z0-9_.@+() -]+$/.test(part) &&
          ![".", ".."].includes(part) &&
          !/[. ]$/.test(part) &&
          !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
      )
  )
}

export function catalogRevision(value: Omit<Catalog, "revision">) {
  return digest(
    JSON.stringify({ schemaVersion: value.schemaVersion, compatibility: value.compatibility, skills: value.skills }),
  )
}

function version(value: string) {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) throw new Error("Invalid app version")
  return value.split(".").map(Number)
}

function compare(left: string, right: string) {
  const a = version(left)
  const b = version(right)
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

export function validateCatalog(value: Catalog, appVersion?: string, names?: string[]) {
  if (value?.schemaVersion !== 1 || !isDigest(value.revision) || !Array.isArray(value.skills) || !value.skills.length)
    throw new Error("Invalid skill catalog")
  if (value.revision !== catalogRevision(value)) throw new Error("Catalog revision mismatch")
  version(value.compatibility.minAppVersion)
  if (
    value.compatibility.maxAppVersion &&
    compare(value.compatibility.maxAppVersion, value.compatibility.minAppVersion) < 0
  )
    throw new Error("Invalid compatibility range")
  if (
    appVersion &&
    (compare(appVersion, value.compatibility.minAppVersion) < 0 ||
      (value.compatibility.maxAppVersion && compare(appVersion, value.compatibility.maxAppVersion) > 0))
  )
    throw new Error("Incompatible skill catalog")
  const seen = new Set<string>()
  let bytes = 0
  for (const skill of value.skills) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name) || seen.has(skill.name))
      throw new Error("Duplicate or invalid skill")
    seen.add(skill.name)
    const files = new Set<string>()
    for (const file of skill.files) {
      if (
        !safePath(file.path) ||
        files.has(file.path.toLowerCase()) ||
        !isDigest(file.sha256) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 0
      )
        throw new Error("Invalid skill file")
      files.add(file.path.toLowerCase())
      bytes += file.bytes
    }
    if (!skill.files.some((file) => file.path === "SKILL.md")) throw new Error("Missing SKILL.md")
  }
  if (bytes > MAX_CATALOG_BYTES) throw new Error("Skill catalog too large")
  if (names && [...seen].sort().join("\n") !== [...names].sort().join("\n")) throw new Error("Skill inventory changed")
  return value
}

export function catalogIndex(value: Catalog) {
  return {
    skills: value.skills.map((skill) => ({
      name: skill.name,
      version: value.revision,
      files: skill.files.map((file) => file.path),
    })),
  }
}

export function verifyCatalogDirectory(root: string, appVersion?: string, names?: string[], expectedHash?: string) {
  const raw = readFileSync(path.join(root, "manifest.json"))
  if (expectedHash && digest(raw) !== expectedHash) throw new Error("Manifest hash mismatch")
  const catalog = validateCatalog(JSON.parse(raw.toString()), appVersion, names)
  const expected = new Map<string, { path: string; sha256: string; bytes: number }>(
    catalog.skills.flatMap((skill) => skill.files.map((file) => [`${skill.name}/${file.path}`, file] as const)),
  )
  const walk = (dir: string, prefix = "") => {
    for (const item of readdirSync(dir)) {
      const name = prefix + item
      const full = path.join(dir, item)
      const stat = lstatSync(full)
      if (stat.isSymbolicLink()) throw new Error("Skill symlinks are unsupported")
      if (stat.isDirectory()) {
        walk(full, name + "/")
        continue
      }
      if (name === "manifest.json" || name === "index.json") continue
      const file = expected.get(name)
      if (!file || stat.size !== file.bytes || digest(readFileSync(full)) !== file.sha256)
        throw new Error("Skill file hash mismatch")
      expected.delete(name)
    }
  }
  walk(root)
  if (expected.size) throw new Error("Incomplete skill snapshot")
  for (const skill of catalog.skills) {
    const text = readFileSync(path.join(root, skill.name, "SKILL.md"), "utf8")
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
    if (!frontmatter || frontmatter.match(/^name:\s*([a-z0-9-]+)\s*$/m)?.[1] !== skill.name)
      throw new Error("Skill frontmatter identity mismatch")
  }
  if (
    JSON.stringify(JSON.parse(readFileSync(path.join(root, "index.json"), "utf8"))) !==
    JSON.stringify(catalogIndex(catalog))
  )
    throw new Error("Skill index mismatch")
  return catalog
}
