/**
 * Merge storyboard panel duration into video generation options.
 * Panel `duration` is typically seconds; values >1000 are treated as milliseconds (legacy).
 */

export function panelDurationToSeconds(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value > 1000 ? value / 1000 : value
}

export function pickClosestDurationOption(desiredSeconds: number, allowed: readonly number[]): number {
  if (allowed.length === 0) return desiredSeconds
  const sorted = [...allowed].filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (sorted.length === 0) return desiredSeconds
  let best = sorted[0]!
  let bestDist = Math.abs(desiredSeconds - best)
  for (const x of sorted) {
    const d = Math.abs(desiredSeconds - x)
    if (d < bestDist) {
      best = x
      bestDist = d
    }
  }
  return best
}

export function mergePanelDurationIntoGenerationOptions<T extends Record<string, string | number | boolean>>(
  generationOptions: T,
  panelDurationRaw: number | null | undefined,
  durationOptions: readonly number[] | undefined,
): T {
  if (!durationOptions || durationOptions.length === 0) {
    return generationOptions
  }
  const secs = panelDurationToSeconds(panelDurationRaw ?? null)
  if (secs === null) {
    return generationOptions
  }
  const snapped = pickClosestDurationOption(secs, durationOptions)
  return { ...generationOptions, duration: snapped }
}
