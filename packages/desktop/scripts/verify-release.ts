import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const dist = path.resolve(import.meta.dir, "../dist")
for (const file of readdirSync(dist)) {
  if (/^(latest|community|beta|alpha)(-.*)?\.ya?ml$/i.test(file))
    throw new Error(`Updater feed must not be published: ${file}`)
}
const name = "Gridy-win-x64.exe"
for (const file of [name, `${name}.blockmap`])
  if (!existsSync(path.join(dist, file))) throw new Error(`Missing release artifact: ${file}`)
const sha = createHash("sha256").update(readFileSync(path.join(dist, name))).digest("hex")
writeFileSync(path.join(dist, `${name}.sha256.txt`), `${sha}  ${name}\n`)
console.log(`Verified manual deployment artifacts: ${sha}`)
