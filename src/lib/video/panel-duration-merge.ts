/**
 * Merge storyboard panel duration into video generation options.
 * Panel `duration` is typically seconds; values >1000 are treated as milliseconds (legacy).
 */

export function panelDurationToSeconds(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value > 1000 ? value / 1000 : value
}

/**
 * Pick the smallest allowed duration >= script seconds; if script exceeds all tiers, use max.
 * Matches "don't shorten below pacing" better than rounding to nearest (e.g. 7s → 10s not 5s).
 */
export function pickCeilDurationOptionForScript(desiredSeconds: number, allowed: readonly number[]): number {
  const sorted = [...allowed].filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (sorted.length === 0) return desiredSeconds
  const hit = sorted.find((x) => x >= desiredSeconds)
  return hit !== undefined ? hit : sorted[sorted.length - 1]!
}

function coerceToAllowedDuration(
  raw: string | number | boolean | undefined,
  durationOptions: readonly number[],
): number | null {
  if (raw === undefined) return null
  if (typeof raw === 'boolean') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n)) return null
  return durationOptions.includes(n) ? n : null
}

export function mergePanelDurationIntoGenerationOptions<T extends Record<string, string | number | boolean>>(
  generationOptions: T,
  panelDurationRaw: number | null | undefined,
  durationOptions: readonly number[] | undefined,
): T {
  if (!durationOptions || durationOptions.length === 0) {
    return generationOptions
  }
  const fromUi = coerceToAllowedDuration(generationOptions.duration, durationOptions)
  const secs = panelDurationToSeconds(panelDurationRaw ?? null)
  if (secs === null) {
    if (fromUi !== null) {
      return { ...generationOptions, duration: fromUi }
    }
    return generationOptions
  }
  const scriptSnap = pickCeilDurationOptionForScript(secs, durationOptions)
  if (fromUi !== null && fromUi >= scriptSnap) {
    return { ...generationOptions, duration: fromUi }
  }
  return { ...generationOptions, duration: scriptSnap }
}
