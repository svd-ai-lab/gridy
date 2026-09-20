import { existsSync, readFileSync } from "node:fs"
import { delimiter, isAbsolute, join, relative, resolve } from "node:path"

type RuntimeMetadata = {
  schemaVersion: number
  platform: string
  architecture: string
  indexUrl: string
  pythonInstallMirror: string
  astralMirrorUrl: string
  uv: { version: string; path: string }
}

export function resolveToolRuntime(
  resourcesPath: string,
  userDataPath: string,
  packaged: boolean,
  currentPath = process.env.PATH ?? "",
) {
  const root = packaged
    ? join(resourcesPath, "tool-runtime")
    : resolve(resourcesPath, "../../resources/tool-runtime/staged")
  const metadataPath = join(root, "runtime.json")
  if (!existsSync(metadataPath)) return null

  const metadata = readMetadata(metadataPath)
  if (!metadata) return null
  if (metadata.platform !== process.platform || metadata.architecture !== process.arch) return null

  const uv = resolve(root, metadata.uv.path)
  if (!inside(root, uv) || !existsSync(uv)) return null
  return {
    GRIDY_TOOL_RUNTIME: root,
    GRIDY_TOOL_UV: uv,
    PATH: [root, currentPath].filter(Boolean).join(delimiter),
    UV_CACHE_DIR: join(userDataPath, "tool-runtime", "uv-cache"),
    UV_PYTHON_DOWNLOADS: "manual",
    UV_PYTHON_INSTALL_MIRROR: metadata.pythonInstallMirror,
    UV_ASTRAL_MIRROR_URL: metadata.astralMirrorUrl,
    UV_DEFAULT_INDEX: metadata.indexUrl,
  }
}

function readMetadata(file: string): RuntimeMetadata | null {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"))
    if (value.schemaVersion !== 1) return null
    if (![value.indexUrl, value.pythonInstallMirror, value.astralMirrorUrl].every(isHttpsUrl)) return null
    if (typeof value.uv?.version !== "string" || typeof value.uv?.path !== "string") return null
    return value
  } catch {
    return null
  }
}

function isHttpsUrl(value: unknown): value is string {
  return typeof value === "string" && /^https:\/\//.test(value)
}

function inside(root: string, candidate: string) {
  const value = relative(resolve(root), candidate)
  return value !== "" && !value.startsWith("..") && !isAbsolute(value)
}
