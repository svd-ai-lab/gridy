import { expect, test } from "bun:test"
import { gridyProfileEnv } from "./src/main/gridy-profile"

test("production deployment has its own identity, retains data and publishes no update feed", async () => {
  const previous = process.env.OPENCODE_CHANNEL
  process.env.OPENCODE_CHANNEL = "prod"
  try {
    const { default: config } = await import("./electron-builder.config.ts")
    expect(config.appId).toBe("ai.svd.gridy.desktop")
    expect(config.productName).toBe("Gridy")
    expect(config.publish).toBeNull()
    expect(config.generateUpdatesFilesForAllChannels).toBe(false)
    expect(config.nsis?.deleteAppDataOnUninstall).toBe(false)
    expect(config.nsis?.include).toBe("resources/installer.nsh")
  } finally {
    if (previous === undefined) delete process.env.OPENCODE_CHANNEL
    else process.env.OPENCODE_CHANNEL = previous
  }
})

test("agent data, configuration, cache and state stay within the selected desktop profile", () => {
  const profiles = ["/profiles/gridy-a", "/profiles/gridy-b"].map(gridyProfileEnv)
  expect(Object.keys(profiles[0])).toEqual(["XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"])
  for (const key of Object.keys(profiles[0]) as (keyof typeof profiles[0])[]) {
    expect(profiles[0][key]).toContain("gridy-a")
    expect(profiles[1][key]).toContain("gridy-b")
    expect(profiles[0][key]).not.toBe(profiles[1][key])
  }
})
