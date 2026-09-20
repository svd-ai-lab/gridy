import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { configDir, manifestPath, readJson, type SkillsManifest } from "./gridy-skills"

type Provider = {
  id?: unknown
  kind?: unknown
  capabilities?: unknown
  requires?: unknown
  baseUrlEnv?: unknown
  authEnv?: unknown
}

type ResearchCapabilities = {
  version?: unknown
  providers?: unknown
}

const researchSkillDir = path.join(configDir, "skills", "research-paper-data")
const capabilitiesPath = path.join(configDir, "research-capabilities.json")
const agentsPath = path.join(configDir, "AGENTS.md")
const allowedProviderKinds = new Set(["public", "user-configured", "managed"])

const publicSkillCoupling = [
  { pattern: /\bSIM_STUDIO_[A-Z0-9_]*\b/g, reason: "edition-specific environment variable" },
  { pattern: /\/research\/papers/gi, reason: "edition managed provider route" },
]

const overlayWorkflowCoupling = [
  { pattern: /https:\/\/api\.(crossref|datacite)\.org|export\.arxiv\.org|europepmc\/webservices/gi, reason: "provider endpoint copied into overlay" },
  { pattern: /academic_search\.py.*--limit/gi, reason: "skill workflow copied into overlay" },
  { pattern: /\/research\/papers/gi, reason: "managed provider endpoint copied into overlay" },
]

function walkTextFiles(root: string) {
  const files: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        walk(full)
        continue
      }
      if (stat.isFile() && /\.(md|py|json|ya?ml|txt)$/i.test(entry)) files.push(full)
    }
  }
  walk(root)
  return files
}

function assertNoMatches(files: string[], checks: Array<{ pattern: RegExp; reason: string }>) {
  const failures: string[] = []
  for (const file of files) {
    const text = readFileSync(file, "utf8")
    for (const check of checks) {
      check.pattern.lastIndex = 0
      const match = check.pattern.exec(text)
      if (match) failures.push(`${path.relative(configDir, file)}: ${check.reason}: ${match[0]}`)
    }
  }
  if (failures.length > 0) throw new Error(`Research bundle lint failed:\n${failures.join("\n")}`)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function managedProviderChecks(value: ResearchCapabilities) {
  if (!Array.isArray(value.providers)) return []
  const checks: Array<{ pattern: RegExp; reason: string }> = []
  for (const provider of value.providers as Provider[]) {
    if (provider.kind !== "managed") continue
    for (const [field, token] of [
      ["provider id", provider.id],
      ["base URL env", provider.baseUrlEnv],
      ["auth env", provider.authEnv],
    ] as const) {
      if (typeof token !== "string" || token.length === 0) continue
      checks.push({
        pattern: new RegExp(`\\b${escapeRegExp(token)}\\b`, "g"),
        reason: `managed research ${field}`,
      })
    }
  }
  return checks
}

function validateCapabilities(value: ResearchCapabilities) {
  if (value.version !== 1) throw new Error("research-capabilities.json must use version 1")
  if (!Array.isArray(value.providers)) throw new Error("research-capabilities.json providers must be an array")

  const ids = new Set<string>()
  for (const provider of value.providers as Provider[]) {
    if (typeof provider.id !== "string" || !provider.id) throw new Error("research provider id must be a string")
    if (ids.has(provider.id)) throw new Error(`duplicate research provider id: ${provider.id}`)
    ids.add(provider.id)

    if (typeof provider.kind !== "string" || !allowedProviderKinds.has(provider.kind)) {
      throw new Error(`research provider ${provider.id} has invalid kind`)
    }
    if (provider.kind === "managed") {
      throw new Error(`research provider ${provider.id} must not be managed in this edition manifest`)
    }
    if (!Array.isArray(provider.capabilities) || provider.capabilities.some((item) => typeof item !== "string")) {
      throw new Error(`research provider ${provider.id} capabilities must be string[]`)
    }
    if (provider.requires !== undefined && !Array.isArray(provider.requires)) {
      throw new Error(`research provider ${provider.id} requires must be an array`)
    }
  }
}

export function lintResearchBundle() {
  const manifest = readJson<SkillsManifest>(manifestPath)
  const entry = manifest.skills.find((item) => item.name === "research-paper-data")
  if (!entry) throw new Error("research-paper-data is missing from skills.manifest.json")
  if (entry.repo !== "svd-ai-lab/sim-skills" || entry.path !== "research-paper-data") {
    throw new Error("research-paper-data must come from svd-ai-lab/sim-skills/research-paper-data")
  }
  if (!existsSync(path.join(researchSkillDir, "SKILL.md"))) {
    throw new Error("materialized research-paper-data skill is missing")
  }

  const capabilities = readJson<ResearchCapabilities>(capabilitiesPath)
  validateCapabilities(capabilities)

  assertNoMatches(walkTextFiles(researchSkillDir), [...publicSkillCoupling, ...managedProviderChecks(capabilities)])
  assertNoMatches([agentsPath], overlayWorkflowCoupling)
}
