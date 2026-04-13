/**
 * Client-safe feature flags (require NEXT_PUBLIC_* for use in Client Components).
 */
export function isAiClipEditorNavEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AI_CLIP_EDITOR_ENABLED === 'true'
}
