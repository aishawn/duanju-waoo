import { fal } from '@fal-ai/client'
import { submitFalTask } from '@/lib/async-submit'
import { getProviderConfig } from '@/lib/api-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import type { LipSyncParams, LipSyncResult, LipSyncSubmitContext } from '@/lib/lipsync/types'

function isFalCdnUrl(url: string): boolean {
  try {
    const trimmed = url.trim()
    if (!trimmed.startsWith('https://')) return false
    const host = new URL(trimmed).hostname
    return host === 'v3.fal.media' || host === 'fal.media' || host.endsWith('.fal.media')
  } catch {
    return false
  }
}

/** Parse data:...;base64,... into a Blob for fal.storage.upload (Kling lip sync rejects large inline data URLs). */
function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)(;[^;,]+)*;base64,([\s\S]*)$/i.exec(dataUrl.trim())
  if (!match) {
    throw new Error('FAL_LIPSYNC_DATA_URL_INVALID')
  }
  const mime = match[1].trim() || 'application/octet-stream'
  const b64 = match[3].replace(/\s/g, '')
  const buffer = Buffer.from(b64, 'base64')
  return new Blob([buffer], { type: mime })
}

async function ensureFalHostedMediaUrl(raw: string, apiKey: string): Promise<string> {
  const trimmed = raw.trim()
  if (isFalCdnUrl(trimmed)) {
    return trimmed
  }

  const dataUrl = trimmed.startsWith('data:')
    ? trimmed
    : await normalizeToBase64ForGeneration(trimmed)

  fal.config({ credentials: apiKey })
  const blob = dataUrlToBlob(dataUrl)
  return await fal.storage.upload(blob)
}

export async function submitFalLipSync(
  params: LipSyncParams,
  context: LipSyncSubmitContext,
): Promise<LipSyncResult> {
  const endpoint = context.modelId.trim()
  if (!endpoint) {
    throw new Error(`LIPSYNC_ENDPOINT_MISSING: ${context.modelKey}`)
  }

  const { apiKey } = await getProviderConfig(context.userId, context.providerId)

  const [video_url, audio_url] = await Promise.all([
    ensureFalHostedMediaUrl(params.videoUrl, apiKey),
    ensureFalHostedMediaUrl(params.audioUrl, apiKey),
  ])

  const requestId = await submitFalTask(endpoint, {
    video_url,
    audio_url,
  }, apiKey)

  return {
    requestId,
    externalId: `FAL:VIDEO:${endpoint}:${requestId}`,
    async: true,
  }
}
