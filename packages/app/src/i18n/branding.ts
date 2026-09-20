export function brandTranslationValues<T extends Record<string, string>>(dictionary: T, productName?: string): T {
  if (!productName || productName === "OpenCode") return dictionary
  return Object.fromEntries(Object.entries(dictionary).map(([key, value]) => [
    key,
    key.startsWith("provider.connect.opencode") || key.startsWith("dialog.model.unpaid.freeModels.")
      ? value
      : value.replace(/OpenCode(?! (?:Zen|Go))/g, productName),
  ])) as T
}
