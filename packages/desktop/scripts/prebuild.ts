#!/usr/bin/env bun
import { $ } from "bun"
import runtime from "../../opencode/package.json"

import { downloadCliToResources, resolveChannel } from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/materialize-gridy-skills.ts`
if (process.platform === "win32") await $`bun ./scripts/prepare-tool-runtime.ts`
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

// Native providers use the agent version for protocol compatibility checks.
await $`cd ../opencode && bun script/build-node.ts`.env({ ...process.env, OPENCODE_VERSION: runtime.version })
if (channel === "dev") await downloadCliToResources()
