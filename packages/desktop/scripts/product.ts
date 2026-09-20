import { readFileSync } from "node:fs"

export function resolveChannel(): "dev" | "beta" | "prod" {
  const channel = process.env.OPENCODE_CHANNEL
  if (channel === "prod" || channel === "latest") return "prod"
  return channel === "beta" ? "beta" : "dev"
}

type ProductConfig = {
  productName: string
  installName: string
  appIds: Record<"dev" | "beta" | "prod", string>
}

export function loadProductConfig(): ProductConfig {
  const config: ProductConfig = JSON.parse(readFileSync(new URL("../gridy.json", import.meta.url), "utf8"))
  return config
}
