import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { catalogIndex, catalogRevision, digest, validateCatalog } from "../src/shared/skill-catalog"
import type { Catalog } from "../src/shared/skill-catalog"

export function writeCatalog(root: string, names: string[], minAppVersion: string) {
  const files = (directory: string, prefix = ""): { path: string; sha256: string; bytes: number }[] =>
    readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => {
        const full = path.join(directory, entry.name)
        if (entry.isSymbolicLink()) throw new Error("Symlink in skill package")
        if (entry.isDirectory()) return files(full, `${prefix}${entry.name}/`)
        const content = readFileSync(full)
        return [{ path: prefix + entry.name, sha256: digest(content), bytes: content.length }]
      })
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const payload = {
    schemaVersion: 1 as const,
    compatibility: { minAppVersion },
    skills: [...names].sort().map((name) => ({ name, files: files(path.join(root, name)) })),
  }
  const catalog: Catalog = { ...payload, revision: catalogRevision(payload) }
  validateCatalog(catalog)
  writeFileSync(path.join(root, "manifest.json"), JSON.stringify(catalog, null, 2) + "\n")
  writeFileSync(path.join(root, "index.json"), JSON.stringify(catalogIndex(catalog)) + "\n")
  return catalog
}
