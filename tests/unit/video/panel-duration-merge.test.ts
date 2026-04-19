import { describe, expect, it } from 'vitest'
import {
  mergePanelDurationIntoGenerationOptions,
  panelDurationToSeconds,
  pickCeilDurationOptionForScript,
} from '@/lib/video/panel-duration-merge'

describe('panel-duration-merge', () => {
  it('panelDurationToSeconds treats small values as seconds', () => {
    expect(panelDurationToSeconds(8)).toBe(8)
    expect(panelDurationToSeconds(5)).toBe(5)
  })

  it('panelDurationToSeconds treats large values as ms', () => {
    expect(panelDurationToSeconds(5000)).toBe(5)
  })

  it('pickCeilDurationOptionForScript picks smallest tier >= script (ceil)', () => {
    expect(pickCeilDurationOptionForScript(7, [5, 10])).toBe(10)
    expect(pickCeilDurationOptionForScript(4, [5, 10])).toBe(5)
    expect(pickCeilDurationOptionForScript(10, [5, 10])).toBe(10)
    expect(pickCeilDurationOptionForScript(12, [5, 10])).toBe(10)
  })

  it('mergePanelDurationIntoGenerationOptions snaps duration when panel has duration', () => {
    const out = mergePanelDurationIntoGenerationOptions(
      { resolution: '720p' },
      12,
      [5, 10, 15],
    )
    expect(out).toHaveProperty('duration', 15)
    expect(out.resolution).toBe('720p')

    const seven = mergePanelDurationIntoGenerationOptions({}, 7, [5, 10])
    expect(seven).toHaveProperty('duration', 10)
  })

  it('merge keeps UI duration when it is an allowed tier (overrides panel rhythm)', () => {
    const out = mergePanelDurationIntoGenerationOptions({ duration: 8 }, 4, [4, 6, 8])
    expect(out.duration).toBe(8)
  })

  it('merge coerces string UI duration when allowed', () => {
    const out = mergePanelDurationIntoGenerationOptions({ duration: '10' }, 4, [5, 10])
    expect(out.duration).toBe(10)
  })

  it('merge falls back to panel when UI duration is not an allowed tier', () => {
    const out = mergePanelDurationIntoGenerationOptions({ duration: 99 }, 4, [4, 6, 8])
    expect(out.duration).toBe(4)
  })

  it('merge uses script snap when UI default is shorter than panel rhythm', () => {
    const out = mergePanelDurationIntoGenerationOptions({ duration: 3 }, 4, [3, 4, 5, 6, 7, 8])
    expect(out.duration).toBe(4)
  })

  it('merge does not shorten below script snap when user picks a shorter allowed tier', () => {
    const out = mergePanelDurationIntoGenerationOptions({ duration: 6 }, 8, [4, 6, 8])
    expect(out.duration).toBe(8)
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
