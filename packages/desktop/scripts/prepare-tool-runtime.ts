#!/usr/bin/env bun
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"

type Artifact = { version: string; file: string; url: string; bytes: number; sha256: string; license: string }
type Manifest = {
  schemaVersion: number
  platform: string
  architecture: string
  indexUrl: string
  pythonInstallMirror: string
  astralMirrorUrl: string
  artifacts: { uv: Artifact }
}

const packageDir = path.resolve(import.meta.dir, "..")
const sourceDir = path.join(packageDir, "resources", "tool-runtime")
const cacheDir = path.resolve(process.env.GRIDY_TOOL_RUNTIME_CACHE ?? path.join(packageDir, ".tool-runtime-cache"))
const stageDir = path.resolve(process.env.GRIDY_TOOL_RUNTIME_STAGE ?? path.join(sourceDir, "staged"))
const offline = process.env.GRIDY_TOOL_RUNTIME_OFFLINE === "1"

const manifest = await readManifest()
if (process.platform !== manifest.platform || process.arch !== manifest.architecture)
  throw new Error(
    `Tool runtime supports ${manifest.platform}/${manifest.architecture}, current host is ${process.platform}/${process.arch}`,
  )

await mkdir(cacheDir, { recursive: true })
const uvArchive = await resolveArtifact(manifest.artifacts.uv)
await rm(stageDir, { recursive: true, force: true })
await mkdir(stageDir, { recursive: true })

const uvExtract = path.join(stageDir, ".uv-extract")
await mkdir(uvExtract, { recursive: true })
await run(["tar", "-xf", uvArchive, "-C", uvExtract])
const uvSource = await findFile(uvExtract, "uv.exe")
const uvPath = path.join(stageDir, "uv.exe")
await cp(uvSource, uvPath)
await rm(uvExtract, { recursive: true, force: true })

const uvVersion = await run([uvPath, "--version"])
if (!new RegExp(`^uv ${manifest.artifacts.uv.version.replaceAll(".", "\\.")}(?:\\s|$)`).test(uvVersion))
  throw new Error(`Unexpected uv version: expected ${manifest.artifacts.uv.version}, got ${uvVersion}`)

await cp(path.join(sourceDir, "THIRD_PARTY_NOTICES.md"), path.join(stageDir, "THIRD_PARTY_NOTICES.md"))
await cp(path.join(sourceDir, "licenses"), path.join(stageDir, "licenses"), { recursive: true })
await writeFile(
  path.join(stageDir, "runtime.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      platform: manifest.platform,
      architecture: manifest.architecture,
      indexUrl: manifest.indexUrl,
      pythonInstallMirror: manifest.pythonInstallMirror,
      astralMirrorUrl: manifest.astralMirrorUrl,
      uv: {
        version: manifest.artifacts.uv.version,
        path: "uv.exe",
        artifactBytes: manifest.artifacts.uv.bytes,
        artifactSha256: manifest.artifacts.uv.sha256,
      },
      licenses: ["THIRD_PARTY_NOTICES.md", "licenses/uv-LICENSE-APACHE", "licenses/uv-LICENSE-MIT"],
    },
    null,
    2,
  ) + "\n",
)
console.log(`Prepared verified tool runtime at ${stageDir}`)

async function readManifest() {
  const value = await Bun.file(path.join(sourceDir, "runtime.manifest.json")).json()
  if (value.schemaVersion !== 1 || value.platform !== "win32" || value.architecture !== "x64")
    throw new Error("Unsupported tool runtime manifest target or schema")
  for (const [name, url] of Object.entries({
    indexUrl: value.indexUrl,
    pythonInstallMirror: value.pythonInstallMirror,
    astralMirrorUrl: value.astralMirrorUrl,
  })) {
    if (typeof url !== "string" || !/^https:\/\//.test(url)) throw new Error(`Tool runtime ${name} must use HTTPS`)
  }
  for (const [name, artifact] of Object.entries(value.artifacts ?? {}) as [string, Artifact][]) {
    if (
      !artifact.version ||
      !artifact.file ||
      !/^https:\/\//.test(artifact.url) ||
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes <= 0 ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
      !artifact.license
    )
      throw new Error(`Invalid ${name} artifact manifest entry`)
  }
  if (!value.artifacts?.uv || Object.keys(value.artifacts).length !== 1)
    throw new Error("Manifest must contain only the uv artifact")
  return value as Manifest
}

async function resolveArtifact(artifact: Artifact) {
  const target = path.join(cacheDir, artifact.file)
  if (existsSync(target) && Bun.file(target).size === artifact.bytes && (await sha256(target)) === artifact.sha256)
    return target
  if (existsSync(target)) await rm(target)
  if (offline) throw new Error(`Offline tool-runtime cache is missing verified artifact: ${artifact.file}`)
  const response = await fetch(artifact.url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok || !response.body) throw new Error(`Failed to download ${artifact.url}: HTTP ${response.status}`)
  await Bun.write(target, response)
  const bytes = Bun.file(target).size
  const digest = await sha256(target)
  if (bytes !== artifact.bytes || digest !== artifact.sha256) {
    await rm(target, { force: true })
    throw new Error(
      `Artifact mismatch for ${artifact.file}: expected ${artifact.bytes} bytes/${artifact.sha256}, got ${bytes} bytes/${digest}`,
    )
  }
  return target
}

async function sha256(file: string) {
  const hash = createHash("sha256")
  for await (const chunk of Bun.file(file).stream()) hash.update(chunk)
  return hash.digest("hex")
}

async function findFile(directory: string, name: string): Promise<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name)
    if (entry.isFile() && entry.name === name) return candidate
    if (entry.isDirectory()) {
      const nested = await findFile(candidate, name).catch(() => null)
      if (nested) return nested
    }
  }
  throw new Error(`${name} not found below ${directory}`)
}

async function run(command: string[], environment: Record<string, string> = {}) {
  const process = Bun.spawn(command, {
    cwd: packageDir,
    env: { ...Bun.env, ...environment },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  if (code !== 0) throw new Error(`${command.join(" ")} failed (${code})\n${stderr || stdout}`)
  return stdout.trim()
}
