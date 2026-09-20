#!/usr/bin/env bun
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const runtime = path.resolve(import.meta.dir, "../resources/tool-runtime/staged")
const uv = path.join(runtime, "uv.exe")
if (!existsSync(uv)) throw new Error("Prepare the tool runtime before running its smoke test")

const stagedFiles = await listFiles(runtime)
const forbiddenRuntimeFile = stagedFiles.find((file) =>
  /(^|\/)(python(?:\.exe|-env)?|site-packages|sim(?:-cli|parse)(?:\.exe)?)(\/|$)/i.test(file),
)
if (forbiddenRuntimeFile) throw new Error(`The staged runtime still bundles ${forbiddenRuntimeFile}`)

const runtimeMetadata = await Bun.file(path.join(runtime, "runtime.json")).json()
if (runtimeMetadata.uv?.version !== "0.12.9") throw new Error("runtime.json does not expose bundled uv 0.12.9")
for (const retired of ["python", "packages", "simparse"]) {
  if (retired in runtimeMetadata) throw new Error(`runtime.json still exposes ${retired}`)
}
for (const license of runtimeMetadata.licenses ?? []) {
  if (!existsSync(path.join(runtime, license))) throw new Error(`Missing staged runtime license: ${license}`)
}

const work = await mkdtemp(path.join(tmpdir(), "gridy-tool-runtime-smoke-"))
const runtimeWithSpaces = path.join(work, "installed app with spaces")
await symlink(runtime, runtimeWithSpaces, "junction")
const spacedUv = path.join(runtimeWithSpaces, "uv.exe")

const baseEnvironment = {
  ...Bun.env,
  UV_CACHE_DIR:
    process.env.GRIDY_TOOL_RUNTIME_SMOKE_UV_CACHE ?? path.resolve(import.meta.dir, "../.tool-runtime-cache/uv"),
  UV_DEFAULT_INDEX: runtimeMetadata.indexUrl,
  UV_PYTHON_DOWNLOADS: "manual",
  UV_PYTHON_INSTALL_MIRROR: runtimeMetadata.pythonInstallMirror,
  UV_ASTRAL_MIRROR_URL: runtimeMetadata.astralMirrorUrl,
}
const isolatedEnvironment = {
  ...baseEnvironment,
  UV_PYTHON_INSTALL_DIR: path.join(work, "uv-python"),
  UV_TOOL_DIR: path.join(work, "uv-tools"),
  UV_TOOL_BIN_DIR: path.join(work, "uv-bin"),
}

const uvVersion = run([spacedUv, "--version"], isolatedEnvironment)
if (!/^uv 0\.12\.9(?:\s|$)/.test(uvVersion)) throw new Error(`Unexpected uv version output: ${uvVersion}`)

const globalToolsBefore = run([uv, "tool", "list"], baseEnvironment)
const globalPythonBefore = run([uv, "python", "list", "--only-installed"], baseEnvironment)
const implicit = runResult(
  [spacedUv, "run", "--managed-python", "--no-project", "--python", "3.12", "python", "-c", "print('unexpected')"],
  isolatedEnvironment,
)
if (implicit.exitCode === 0) throw new Error("uv downloaded Python without an explicit install while downloads were manual")
if (await findFile(path.join(work, "uv-python"), "python.exe"))
  throw new Error("A blocked implicit run still installed Python")

const pythonInstallStarted = performance.now()
const mirrorInstall = runResult(
  [spacedUv, "python", "install", "--no-bin", "--no-registry", "3.12"],
  isolatedEnvironment,
)
let usedConfirmedOfficialFallback = false
if (mirrorInstall.exitCode !== 0) {
  const mirrorError = `${mirrorInstall.stderr}\n${mirrorInstall.stdout}`
  if (!mirrorError.includes(new URL(runtimeMetadata.pythonInstallMirror).hostname))
    throw new Error(`The Python mirror failed without preserving its original error:\n${mirrorError}`)
  if (await findFile(path.join(work, "uv-python"), "python.exe"))
    throw new Error("The failed Python mirror attempt left an installed interpreter")

  // This represents the second, explicit user confirmation required by AGENTS.md.
  // Product code must never perform this source switch automatically.
  const confirmedOfficialFallbackEnvironment = {
    ...isolatedEnvironment,
    UV_PYTHON_INSTALL_MIRROR: undefined,
    UV_ASTRAL_MIRROR_URL: undefined,
  }
  run(
    [spacedUv, "python", "install", "--no-bin", "--no-registry", "3.12"],
    confirmedOfficialFallbackEnvironment,
  )
  usedConfirmedOfficialFallback = true
}
const pythonInstallSeconds = (performance.now() - pythonInstallStarted) / 1000
const python = run([spacedUv, "python", "find", "--managed-python", "3.12"], isolatedEnvironment)
if (!existsSync(python)) throw new Error(`uv python find returned a missing interpreter: ${python}`)

const userProject = path.join(work, "user-project")
await mkdir(userProject)
const projectMetadata = '[project]\nname = "runtime-smoke-fixture"\nversion = "0.0.0"\nrequires-python = ">=3.12"\n'
await writeFile(path.join(userProject, "pyproject.toml"), projectMetadata)
const documentScript = String.raw`
from pathlib import Path
from docx import Document
from openpyxl import Workbook, load_workbook
from PIL import Image
from pypdf import PdfReader, PdfWriter

root = Path(r'${work.replaceAll("\\", "\\\\")}')

pdf = root / 'sample.pdf'
writer = PdfWriter()
writer.add_blank_page(width=200, height=200)
writer.write(pdf)
assert len(PdfReader(pdf).pages) == 1

docx = root / 'sample.docx'
document = Document()
document.add_paragraph('Gridy on-demand document smoke')
document.save(docx)
assert Document(docx).paragraphs[0].text == 'Gridy on-demand document smoke'

xlsx = root / 'sample.xlsx'
book = Workbook()
book.active['A1'] = 2
book.active['A2'] = '=A1*3'
book.save(xlsx)
read_book = load_workbook(xlsx, data_only=False)
assert read_book.active['A2'].value == '=A1*3'

png = root / 'sample.png'
Image.new('RGB', (11, 7), 'navy').save(png)
assert Image.open(png).size == (11, 7)
print('On-demand PDF, DOCX, XLSX, and image smoke passed')
`
run(
  [
    spacedUv,
    "run",
    "--no-project",
    "--python",
    python,
    "--with",
    "pypdf",
    "--with",
    "python-docx",
    "--with",
    "openpyxl",
    "--with",
    "pillow",
    "python",
    "-c",
    documentScript,
  ],
  isolatedEnvironment,
  userProject,
)

const installStarted = performance.now()
run([spacedUv, "tool", "install", "--python", python, "sim-cli-core"], isolatedEnvironment)
const coldInstallSeconds = (performance.now() - installStarted) / 1000
const sim = path.join(isolatedEnvironment.UV_TOOL_BIN_DIR, "sim.exe")
if (!existsSync(sim)) throw new Error("uv tool install did not create the isolated sim.exe")

const version = run([sim, "--version"], isolatedEnvironment)
if (!/^sim, version \d+\.\d+\.\d+/.test(version)) throw new Error(`Unexpected sim version output: ${version}`)
const describe = JSON.parse(run([sim, "describe", "scan"], isolatedEnvironment))
if (describe.name !== "scan" || describe.output_schema !== "ScanResult")
  throw new Error("sim describe scan did not return the agent-readable scan contract")

const simulationFixture = path.join(work, "sample.inp")
await writeFile(
  simulationFixture,
  "*HEADING\nGridy user-managed sim smoke\n*NODE\n1,0,0,0\n2,1,0,0\n*ELEMENT, TYPE=B31\n1,1,2\n*BOUNDARY\n1,1,6,0\n",
)
const scan = JSON.parse(run([sim, "--json", "scan", simulationFixture], isolatedEnvironment))
if (scan.schema_version !== "sim.scan/v1" || scan.engine?.name !== "simparse" || scan.summary?.assets !== 1)
  throw new Error("sim --json scan did not return the expected stable envelope")

run([spacedUv, "tool", "upgrade", "--python", python, "sim-cli-core"], isolatedEnvironment)
const warmStarted = performance.now()
run([sim, "--version"], isolatedEnvironment)
const warmStartSeconds = (performance.now() - warmStarted) / 1000
if (run([uv, "tool", "list"], baseEnvironment) !== globalToolsBefore)
  throw new Error("The isolated smoke changed the user's global uv tool inventory")
if (run([uv, "python", "list", "--only-installed"], baseEnvironment) !== globalPythonBefore)
  throw new Error("The isolated smoke changed the user's global Python inventory")
if ((await Bun.file(path.join(userProject, "pyproject.toml")).text()) !== projectMetadata)
  throw new Error("The on-demand document helper changed the user's project metadata")
if (existsSync(path.join(userProject, "uv.lock")) || existsSync(path.join(userProject, ".venv")))
  throw new Error("The on-demand document helper wrote dependency state into the user's project")
if (JSON.stringify(await listFiles(runtime)) !== JSON.stringify(stagedFiles))
  throw new Error("The isolated smoke changed the packaged Gridy runtime")

const agentGuidance = (
  await Bun.file(path.resolve(import.meta.dir, "../resources/gridy-config/AGENTS.md")).text()
).replaceAll("\r\n", "\n")
for (const expected of [
  "uv python list --only-installed",
  "uv python install",
  "UV_PYTHON_DOWNLOADS=manual",
  "UV_PYTHON_INSTALL_MIRROR",
  "UV_ASTRAL_MIRROR_URL",
  "uv run --no-project --with <package>",
  "uv tool install sim-cli-core\nuv tool upgrade sim-cli-core\nsim describe scan",
  "sim --json scan <path>",
  "Do not run `uv self update`",
]) {
  if (!agentGuidance.includes(expected)) throw new Error(`Bundled guidance is missing: ${expected}`)
}
for (const retired of ["GRIDY_TOOL_PYTHON", "GRIDY_TOOL_SIMPARSE", "stata-sim", "sim-plugin-stata", "sim-plugin-rhino"]) {
  if (agentGuidance.includes(retired)) throw new Error(`Bundled guidance still exposes ${retired}`)
}

console.log(
  `uv-only runtime smoke passed (${uvVersion}; Python install ${pythonInstallSeconds.toFixed(2)}s${usedConfirmedOfficialFallback ? " after confirmed official fallback" : " via CNB mirror"}; ${version}; sim-cli cold install ${coldInstallSeconds.toFixed(2)}s; warm start ${warmStartSeconds.toFixed(2)}s)`,
)
await rm(work, { recursive: true, force: true })

function run(command: string[], environment: Record<string, string | undefined>, cwd?: string) {
  const result = runResult(command, environment, cwd)
  if (result.exitCode !== 0)
    throw new Error(`${command.join(" ")} failed (${result.exitCode})\n${result.stderr || result.stdout}`)
  return result.stdout
}

function runResult(command: string[], environment: Record<string, string | undefined>, cwd?: string) {
  const result = Bun.spawnSync(command, { cwd, env: environment, stdout: "pipe", stderr: "pipe" })
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  }
}

async function listFiles(root: string, relativeRoot = ""): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(path.join(root, relativeRoot), { withFileTypes: true })) {
    const relative = path.join(relativeRoot, entry.name).replaceAll("\\", "/")
    if (entry.isDirectory()) files.push(...(await listFiles(root, relative)))
    else if (entry.isFile()) files.push(relative)
  }
  return files
}

async function findFile(root: string, name: string): Promise<string | undefined> {
  if (!existsSync(root)) return undefined
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return candidate
    if (entry.isDirectory()) {
      const nested = await findFile(candidate, name)
      if (nested) return nested
    }
  }
  return undefined
}
