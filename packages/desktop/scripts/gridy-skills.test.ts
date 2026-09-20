import { afterEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { configDir, loadManifestAndLock, setCatalogDescription, skillsDir } from "./gridy-skills"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("skill catalog descriptions", () => {
  test("replaces only frontmatter description and preserves the on-demand body", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gridy-skill-catalog-"))
    roots.push(root)
    await writeFile(
      root + "/SKILL.md",
      '---\nname: example\ndescription: "Long routing description"\n---\n\n# Body\nKeep me.\n',
    )

    setCatalogDescription(root, "Compact routing description")

    const result = await readFile(path.join(root, "SKILL.md"), "utf8")
    expect(result).toContain('description: "Compact routing description"')
    expect(result).toContain("# Body\nKeep me.\n")
    expect(result).not.toContain("Long routing description")
  })

  test("removes folded YAML description continuation lines", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gridy-skill-catalog-"))
    roots.push(root)
    await writeFile(
      path.join(root, "SKILL.md"),
      "---\nname: example\ndescription: >-\n  Long first line.\n  Long second line.\nlicense: MIT\n---\n\n# Body\nKeep me.\n",
    )

    setCatalogDescription(root, "Compact routing description")

    const result = await readFile(path.join(root, "SKILL.md"), "utf8")
    expect(result).toContain('description: "Compact routing description"\nlicense: MIT')
    expect(result).not.toContain("Long first line")
    expect(result).toContain("# Body\nKeep me.\n")
  })
})

describe("bundled skill catalog", () => {
  test("contains the curated 24 skills without Stata or Rhino", async () => {
    const { manifest, lock } = loadManifestAndLock()
    expect(manifest.skills).toHaveLength(24)
    expect(lock.skills).toHaveLength(24)
    for (const retired of ["stata-sim", "rhino"]) {
      expect(manifest.skills.some((entry) => entry.name === retired)).toBeFalse()
      expect(lock.skills.some((entry) => entry.name === retired)).toBeFalse()
      expect(existsSync(path.join(skillsDir, retired))).toBeFalse()
    }

    const guidance = await readFile(path.join(configDir, "AGENTS.md"), "utf8")
    expect(guidance).not.toContain("stata-sim")
    expect(guidance).not.toContain("sim-plugin-stata")
    expect(guidance).not.toContain("sim-plugin-rhino")
  })
})
