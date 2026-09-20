import { $ } from "bun"
import { downloadCliToResources } from "./utils"

await $`bun run install-electron`

await $`bun ./scripts/materialize-openscience-skills.ts`
await $`bun ./scripts/copy-icons.ts ${process.env.OPENCODE_CHANNEL ?? "dev"}`

await $`cd ../opencode && bun script/build-node.ts`
await downloadCliToResources()
