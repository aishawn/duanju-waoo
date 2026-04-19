import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn())
const submitFalTaskMock = vi.hoisted(() => vi.fn())
const normalizeToBase64ForGenerationMock = vi.hoisted(() => vi.fn())
const falConfigMock = vi.hoisted(() => vi.fn())
const falStorageUploadMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/async-submit', () => ({
  submitFalTask: submitFalTaskMock,
}))

vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: normalizeToBase64ForGenerationMock,
}))

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: falConfigMock,
    storage: {
      upload: falStorageUploadMock,
    },
  },
}))

import { submitFalLipSync } from '@/lib/lipsync/providers/fal'

describe('submitFalLipSync', () => {
  const context = {
    userId: 'user-1',
    providerId: 'fal',
    modelId: 'fal-ai/kling-video/lipsync/audio-to-video',
    modelKey: 'fal::fal-ai/kling-video/lipsync/audio-to-video',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({ apiKey: 'fal-key' })
    submitFalTaskMock.mockResolvedValue('req-1')
    falStorageUploadMock.mockImplementation(async (_blob: Blob) => 'https://v3.fal.media/files/mock.mp4')
  })

  it('uploads video and audio to fal storage then submits HTTPS URLs', async () => {
    normalizeToBase64ForGenerationMock
      .mockResolvedValueOnce('data:video/mp4;base64,AAAA')
      .mockResolvedValueOnce('data:audio/wav;base64,QQ==')

    await submitFalLipSync(
      { videoUrl: 'https://example.com/v.mp4', audioUrl: '/api/storage/sign?key=voice%2Fa.wav' },
      context,
    )

    expect(normalizeToBase64ForGenerationMock).toHaveBeenCalledTimes(2)
    expect(falStorageUploadMock).toHaveBeenCalledTimes(2)
    expect(falConfigMock).toHaveBeenCalledWith({ credentials: 'fal-key' })
    expect(submitFalTaskMock).toHaveBeenCalledWith(
      context.modelId,
      {
        video_url: 'https://v3.fal.media/files/mock.mp4',
        audio_url: 'https://v3.fal.media/files/mock.mp4',
      },
      'fal-key',
    )
  })

  it('skips upload when URL is already on fal.media', async () => {
    const falVideo = 'https://v3.fal.media/files/existing.mp4'
    normalizeToBase64ForGenerationMock.mockResolvedValueOnce('data:audio/wav;base64,QQ==')

    await submitFalLipSync(
      { videoUrl: falVideo, audioUrl: 'https://other/a.wav' },
      context,
    )

    expect(normalizeToBase64ForGenerationMock).toHaveBeenCalledTimes(1)
    expect(falStorageUploadMock).toHaveBeenCalledTimes(1)
    expect(submitFalTaskMock).toHaveBeenCalledWith(
      context.modelId,
      expect.objectContaining({ video_url: falVideo }),
      'fal-key',
    )
  })

  it('accepts inline data URLs and uploads them', async () => {
    normalizeToBase64ForGenerationMock.mockReset()

    await submitFalLipSync(
      {
        videoUrl: 'data:video/mp4;base64,AAAA',
        audioUrl: 'data:audio/wav;base64,QQ==',
      },
      context,
    )

    expect(normalizeToBase64ForGenerationMock).not.toHaveBeenCalled()
    expect(falStorageUploadMock).toHaveBeenCalledTimes(2)
  })
})
