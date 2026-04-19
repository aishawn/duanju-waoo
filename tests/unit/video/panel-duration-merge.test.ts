import { describe, expect, it } from 'vitest'
import {
  mergePanelDurationIntoGenerationOptions,
  panelDurationToSeconds,
  pickClosestDurationOption,
} from '@/lib/video/panel-duration-merge'

describe('panel-duration-merge', () => {
  it('panelDurationToSeconds treats small values as seconds', () => {
    expect(panelDurationToSeconds(8)).toBe(8)
    expect(panelDurationToSeconds(5)).toBe(5)
  })

  it('panelDurationToSeconds treats large values as ms', () => {
    expect(panelDurationToSeconds(5000)).toBe(5)
  })

  it('pickClosestDurationOption picks nearest', () => {
    expect(pickClosestDurationOption(7, [5, 10])).toBe(5)
    expect(pickClosestDurationOption(8, [5, 10])).toBe(10)
    expect(pickClosestDurationOption(7.5, [5, 10])).toBe(5)
  })

  it('mergePanelDurationIntoGenerationOptions snaps duration when panel has duration', () => {
    const out = mergePanelDurationIntoGenerationOptions(
      { resolution: '720p' },
      12,
      [5, 10, 15],
    )
    expect(out.duration).toBe(10)
    expect(out.resolution).toBe('720p')
  })

  it('merge leaves options unchanged without durationOptions', () => {
    const base = { duration: 5 as const }
    expect(mergePanelDurationIntoGenerationOptions(base, 12, undefined)).toEqual(base)
  })

  it('merge leaves options unchanged without panel duration', () => {
    const base = { duration: 5 as const }
    expect(mergePanelDurationIntoGenerationOptions(base, null, [5, 10])).toEqual(base)
  })
})
