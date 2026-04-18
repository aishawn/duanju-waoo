import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { extractStorageKey, getSignedUrl } from '@/lib/storage'

const STORAGE_SIGN_PATH_SUFFIX = '/api/storage/sign'
const MAX_SIGN_GATE_PEEL_DEPTH = 8

function parseStorageSignGateUrl(input: string): URL | null {
  try {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const u = new URL(input)
      return u.pathname.endsWith(STORAGE_SIGN_PATH_SUFFIX) ? u : null
    }
    if (input.startsWith('/api/storage/sign')) {
      return new URL(input, 'http://storage-sign.invalid')
    }
    return null
  } catch {
    return null
  }
}

/** Unwrap mistaken double-/triple-wrapped `/api/storage/sign?key=...` values to the inner storage key. */
export function peelNestedStorageSignGates(input: string): string {
  let current = input.trim()
  for (let depth = 0; depth < MAX_SIGN_GATE_PEEL_DEPTH; depth += 1) {
    const parsed = parseStorageSignGateUrl(current)
    if (!parsed) break
    const inner = parsed.searchParams.get('key')
    if (!inner || inner === current) break
    current = inner
  }
  return current
}

/**
 * Resolve reference audio (storage key, /m/, /api/files/, or sign-gate URL) to one fetchable
 * app-relative signed path for `normalizeToBase64ForGeneration`.
 */
export async function resolveReferenceAudioUrlForGeneration(referenceAudioUrl: string): Promise<string> {
  const ref = peelNestedStorageSignGates(referenceAudioUrl)
  if (ref.startsWith('http') || ref.startsWith('data:')) {
    return ref
  }
  if (ref.startsWith('/m/')) {
    const storageKey = await resolveStorageKeyFromMediaValue(ref)
    if (!storageKey) {
      throw new Error(`无法解析参考音频路径: ${ref}`)
    }
    return getSignedUrl(storageKey, 3600)
  }
  if (ref.startsWith('/api/files/')) {
    const storageKey = extractStorageKey(ref)
    return storageKey ? getSignedUrl(storageKey, 3600) : ref
  }
  return getSignedUrl(ref, 3600)
}
