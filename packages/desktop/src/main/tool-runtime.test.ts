import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { delimiter, join } from "node:path"
import { resolveToolRuntime } from "./tool-runtime"

const root = join(import.meta.dir, ".tool-runtime-test")
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe("resolveToolRuntime", () => {
  test("returns a private sidecar environment for a valid runtime", () => {
    const runtime = join(root, "tool-runtime")
    mkdirSync(runtime, { recursive: true })
    writeFileSync(join(runtime, "uv.exe"), "")
    writeFileSync(join(runtime, "runtime.json"), JSON.stringify(metadata()))
    const originalPath = join(root, "system-bin")
    const result = resolveToolRuntime(root, join(root, "user"), true, originalPath)
    expect(result).toMatchObject({
      GRIDY_TOOL_RUNTIME: runtime,
      GRIDY_TOOL_UV: join(runtime, "uv.exe"),
      PATH: `${runtime}${delimiter}${originalPath}`,
      UV_PYTHON_DOWNLOADS: "manual",
      UV_PYTHON_INSTALL_MIRROR: "https://python.example.invalid/releases/download",
      UV_ASTRAL_MIRROR_URL: "https://astral.example.invalid/",
      UV_DEFAULT_INDEX: "https://example.invalid/simple/",
    })
    expect(result).not.toHaveProperty("GRIDY_TOOL_PYTHON")
    expect(result).not.toHaveProperty("UV_PYTHON_INSTALL_DIR")
    expect(result).not.toHaveProperty("UV_PYTHON_NO_REGISTRY")
    expect(result).not.toHaveProperty("PYTHONNOUSERSITE")
    expect(result).not.toHaveProperty("GRIDY_TOOL_SIMPARSE")
  })

  test("is optional when missing or invalid", () => {
    expect(resolveToolRuntime(root, join(root, "user"), true)).toBeNull()
    mkdirSync(join(root, "tool-runtime"), { recursive: true })
    writeFileSync(join(root, "tool-runtime", "runtime.json"), "not json")
    expect(resolveToolRuntime(root, join(root, "user"), true)).toBeNull()
  })

  test("rejects paths outside the runtime", () => {
    const runtime = join(root, "tool-runtime")
    mkdirSync(runtime, { recursive: true })
    writeFileSync(join(runtime, "runtime.json"), JSON.stringify({ ...metadata(), uv: { path: "../uv.exe" } }))
    expect(resolveToolRuntime(root, join(root, "user"), true)).toBeNull()
  })

  test("rejects missing uv executable", () => {
    const runtime = join(root, "tool-runtime")
    mkdirSync(runtime, { recursive: true })
    writeFileSync(join(runtime, "runtime.json"), JSON.stringify(metadata()))
    expect(resolveToolRuntime(root, join(root, "user"), true)).toBeNull()
  })

  test("rejects invalid mirror metadata", () => {
    const runtime = join(root, "tool-runtime")
    mkdirSync(runtime, { recursive: true })
    writeFileSync(join(runtime, "uv.exe"), "")
    writeFileSync(join(runtime, "runtime.json"), JSON.stringify({ ...metadata(), astralMirrorUrl: "http://mirror" }))
    expect(resolveToolRuntime(root, join(root, "user"), true)).toBeNull()
  })

  test("rejects runtime metadata for a different architecture", () => {
    const runtime = join(root, "tool-runtime")
    mkdirSync(runtime, { recursive: true })
    writeFileSync(join(runtime, "uv.exe"), "")
    writeFileSync(join(runtime, "runtime.json"), JSON.stringify({ ...metadata(), architecture: "not-this-arch" }))
    expect(resolveToolRuntime(root, join(root, "user"), true)).toBeNull()
  })
})

function metadata() {
  return {
    schemaVersion: 1,
    platform: process.platform,
    architecture: process.arch,
    indexUrl: "https://example.invalid/simple/",
    pythonInstallMirror: "https://python.example.invalid/releases/download",
    astralMirrorUrl: "https://astral.example.invalid/",
    uv: { version: "0.12.9", path: "uv.exe" },
  }
}
