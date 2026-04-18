import { beforeEach, describe, expect, it, vi } from 'vitest'

const extractStorageKeyMock = vi.hoisted(() => vi.fn())
const getSignedUrlMock = vi.hoisted(() => vi.fn((key: string, exp: number) => `/api/storage/sign?key=${encodeURIComponent(key)}&expires=${exp}`))
const resolveStorageKeyFromMediaValueMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/storage', () => ({
  extractStorageKey: extractStorageKeyMock,
  getSignedUrl: getSignedUrlMock,
}))

vi.mock('@/lib/media/service', () => ({
  resolveStorageKeyFromMediaValue: resolveStorageKeyFromMediaValueMock,
}))

import {
  peelNestedStorageSignGates,
  resolveReferenceAudioUrlForGeneration,
} from '@/lib/voice/reference-audio-url'

describe('reference-audio-url', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('peelNestedStorageSignGates', () => {
    it('unwraps relative sign gate to inner storage key', () => {
      const inner = 'images/voice/custom/p/c/file.mp3'
      const wrapped = `/api/storage/sign?key=${encodeURIComponent(inner)}&expires=7200`
      expect(peelNestedStorageSignGates(wrapped)).toBe(inner)
    })

    it('unwraps absolute sign gate URL', () => {
      const inner = 'voice/ref.wav'
      const wrapped = `https://app.example.com/api/storage/sign?key=${encodeURIComponent(inner)}&expires=3600`
      expect(peelNestedStorageSignGates(wrapped)).toBe(inner)
    })

    it('unwraps multiply nested sign gates', () => {
      const inner = 'images/voice/x.mp3'
      const layer1 = `/api/storage/sign?key=${encodeURIComponent(inner)}&expires=7200`
      const layer2 = `/api/storage/sign?key=${encodeURIComponent(layer1)}&expires=3600`
      expect(peelNestedStorageSignGates(layer2)).toBe(inner)
    })

    it('leaves bare storage key unchanged', () => {
      expect(peelNestedStorageSignGates('images/voice/x.mp3')).toBe('images/voice/x.mp3')
    })

    it('leaves arbitrary https URL unchanged', () => {
      expect(peelNestedStorageSignGates('https://cdn.example.com/a.mp3')).toBe('https://cdn.example.com/a.mp3')
    })
  })

  describe('resolveReferenceAudioUrlForGeneration', () => {
    it('signs once after peeling mistaken double-wrapped gate', async () => {
      const inner = 'images/voice/custom/p/c/file.mp3'
      const mistaken = `/api/storage/sign?key=${encodeURIComponent(inner)}&expires=7200`

      const out = await resolveReferenceAudioUrlForGeneration(mistaken)

      expect(getSignedUrlMock).toHaveBeenCalledTimes(1)
      expect(getSignedUrlMock).toHaveBeenCalledWith(inner, 3600)
      expect(out).toContain(encodeURIComponent(inner))
      expect(out).not.toContain(encodeURIComponent('/api/storage/sign'))
    })

    it('resolves /m/ via media service then signs', async () => {
      resolveStorageKeyFromMediaValueMock.mockResolvedValueOnce('voice/k.wav')
      const out = await resolveReferenceAudioUrlForGeneration('/m/abc')
      expect(resolveStorageKeyFromMediaValueMock).toHaveBeenCalledWith('/m/abc')
      expect(getSignedUrlMock).toHaveBeenCalledWith('voice/k.wav', 3600)
      expect(out).toContain('voice%2Fk.wav')
    })

    it('passes through https URL', async () => {
      const u = 'https://cdn.example.com/a.mp3'
      expect(await resolveReferenceAudioUrlForGeneration(u)).toBe(u)
      expect(getSignedUrlMock).not.toHaveBeenCalled()
    })
  })
})
