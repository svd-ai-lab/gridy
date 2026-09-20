import { join } from "node:path"

/** All persistent agent state belongs to this edition's desktop profile. */
export function gridyProfileEnv(userData: string) {
  return {
    XDG_DATA_HOME: join(userData, "agent", "data"),
    XDG_CONFIG_HOME: join(userData, "agent", "config"),
    XDG_CACHE_HOME: join(userData, "agent", "cache"),
    XDG_STATE_HOME: join(userData, "agent", "state"),
  }
}
