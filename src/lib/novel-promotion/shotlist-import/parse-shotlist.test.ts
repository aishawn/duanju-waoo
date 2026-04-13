import { describe, expect, it } from 'vitest'
import {
  normalizeShotlistFromUnknown,
  parseDurationCell,
  parseShotlistPaste,
  readFiniteNumber,
} from './parse-shotlist'

describe('parse-shotlist', () => {
  it('parseDurationCell: range and single', () => {
    expect(parseDurationCell('0-7')).toEqual({
      durationSec: 7,
      srtStart: 0,
      srtEnd: 7,
    })
    expect(parseDurationCell('8')).toEqual({
      durationSec: 8,
      srtStart: null,
      srtEnd: null,
    })
  })

  it('parseMarkdown table with separator row', () => {
    const md = [
      '| 镜头 | 时长(秒) | 画面类型 | 画面内容 | 屏幕字幕 | 口播（逐字） |',
      '|------|----------|----------|----------|----------|-------------|',
      '| 1 | 0-7 | 博主口播 | 画面A | 字A | 第一句口播。 |',
      '| 2 | 7-14 | 图文 | 画面B | 字B | 第二句口播。 |',
    ].join('\n')
    const p = parseShotlistPaste(md)
    expect(p.shots).toHaveLength(2)
    expect(p.shots[0].durationSec).toBe(7)
    expect(p.shots[0].srtStart).toBe(0)
    expect(p.shots[0].srtEnd).toBe(7)
    expect(p.shots[0].narration).toContain('第一句')
    expect(p.shots[1].narration).toContain('第二句')
  })

  it('normalizeShotlistFromUnknown coerces string numbers', () => {
    const n = normalizeShotlistFromUnknown({
      speaker: '旁白',
      shots: [
        {
          durationSec: '9',
          narration: 'hello',
          srtStart: '1',
          srtEnd: '10',
        },
      ],
    })
    expect(n.shots[0].durationSec).toBe(9)
    expect(n.shots[0].srtStart).toBe(1)
    expect(n.shots[0].srtEnd).toBe(10)
  })

  it('readFiniteNumber', () => {
    expect(readFiniteNumber('12')).toBe(12)
    expect(readFiniteNumber('1,234')).toBe(1234)
    expect(readFiniteNumber(null)).toBeNull()
  })

  it('parseShotlistPaste: JSON branch', () => {
    const j = JSON.stringify({
      speaker: '主持人',
      shots: [{ durationSec: 5, narration: 'abc', description: 'd' }],
    })
    const p = parseShotlistPaste(j)
    expect(p.speaker).toBe('主持人')
    expect(p.shots[0].narration).toBe('abc')
    expect(p.shots[0].description).toBe('d')
  })
})
