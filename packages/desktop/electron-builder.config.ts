import { readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Configuration } from "electron-builder"
import { loadProductConfig, resolveChannel } from "./scripts/product"

const product = loadProductConfig()
const channel = resolveChannel()
const appId = product.appIds[channel]
const packageDir = path.dirname(fileURLToPath(import.meta.url))
const nativeExclusions = [["@lydell", "node-pty"], ["@parcel", "watcher"]].flatMap(([scope, name]) =>
  readdirSync(path.join(packageDir, "node_modules", scope), { withFileTypes: true })
    .filter((entry) => entry.name.startsWith(`${name}-`) && entry.name !== `${name}-${process.platform}-${process.arch}`)
    .map((entry) => `!node_modules/${scope}/${entry.name}/**`),
)

const config: Configuration = {
  appId,
  productName: channel === "prod" ? product.productName : `${product.productName} ${channel === "dev" ? "Dev" : "Beta"}`,
  artifactName: "Gridy-${os}-${arch}.${ext}",
  directories: { output: "dist", buildResources: "resources" },
  extraMetadata: { name: product.installName, desktopName: `${appId}.desktop` },
  files: ["out/**/*", "!out/renderer/**/*.map", "resources/**/*", "!resources/opencode-cli*", ...nativeExclusions],
  asarUnpack: ["out/main/chunks/*.node"],
  extraResources: [
    { from: "resources/gridy-config", to: "gridy-config", filter: ["**/*"] },
    { from: "native/", to: "native/", filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"] },
    ...(process.platform === "win32" ? [{ from: "resources/tool-runtime/staged", to: "tool-runtime" }] : []),
  ],
  protocols: { name: "Gridy", schemes: ["gridy"] },
  // Historical managed clients still request latest.yml from this repository.
  generateUpdatesFilesForAllChannels: false,
  publish: null,
  win: {
    icon: "resources/icons/icon.ico",
    signAndEditExecutable: true,
    target: [{ target: "nsis", arch: ["x64"] }],
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    include: "resources/installer.nsh",
    deleteAppDataOnUninstall: false,
    shortcutName: "Gridy",
    uninstallDisplayName: "Gridy ${version}",
    installerIcon: "resources/icons/icon.ico",
    installerHeaderIcon: "resources/icons/icon.ico",
  },
  mac: { icon: "resources/icons/icon.icns", target: ["dmg", "zip"], category: "public.app-category.developer-tools" },
  linux: { icon: "resources/icons", executableName: appId, target: ["AppImage"], category: "Development" },
}

export default config
