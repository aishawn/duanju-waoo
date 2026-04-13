'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { AppIcon } from '@/components/ui/icons'
import { GlassButton, GlassSurface } from '@/components/ui/primitives'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import { queryKeys } from '@/lib/query/keys'
import { parseShotlistPaste, type ParsedShotlist } from '@/lib/novel-promotion/shotlist-import/parse-shotlist'
import { lockModalPageScroll } from './modal-scroll-lock'

export interface ShotlistStoryboardOption {
  id: string
  label: string
}

interface ShotlistImportDialogProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  episodeId: string
  storyboardOptions: ShotlistStoryboardOption[]
}

export default function ShotlistImportDialog({
  isOpen,
  onClose,
  projectId,
  episodeId,
  storyboardOptions,
}: ShotlistImportDialogProps) {
  const t = useTranslations('storyboard.shotlistImport')
  const queryClient = useQueryClient()
  const baseId = useId()

  const [paste, setPaste] = useState('')
  const [speaker, setSpeaker] = useState('旁白')
  const [novelTextExtra, setNovelTextExtra] = useState('')
  const [storyboardId, setStoryboardId] = useState('')
  const [parsed, setParsed] = useState<ParsedShotlist | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [llmParsing, setLlmParsing] = useState(false)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (!isOpen) return
    const unlock = lockModalPageScroll(document)
    return unlock
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false
      return
    }

    if (!wasOpenRef.current) {
      wasOpenRef.current = true
      setParseError(null)
      setSubmitError(null)
      setParsed(null)
      setPaste('')
      setSpeaker('旁白')
      setNovelTextExtra('')
      setStoryboardId(storyboardOptions[0]?.id ?? '')
      return
    }

    setStoryboardId((prev) =>
      storyboardOptions.some((o) => o.id === prev) ? prev : (storyboardOptions[0]?.id ?? ''),
    )
  }, [isOpen, storyboardOptions])

  const handleParse = useCallback(() => {
    setParseError(null)
    setSubmitError(null)
    try {
      const result = parseShotlistPaste(paste)
      setParsed(result)
      setSpeaker(result.speaker)
      setNovelTextExtra(result.novelText ?? '')
    } catch (e) {
      setParsed(null)
      setParseError(e instanceof Error ? e.message : String(e))
    }
  }, [paste])

  const handleLlmParse = useCallback(async () => {
    const raw = paste.trim()
    if (!raw) return
    setLlmParsing(true)
    setParseError(null)
    setSubmitError(null)
    try {
      const res = await apiFetch(`/api/novel-promotion/${projectId}/parse-shotlist-llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: raw }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        setParsed(null)
        setParseError(resolveTaskErrorMessage(payload, t('llmFailed')))
        return
      }
      const data = (await res.json()) as { parsed?: ParsedShotlist }
      const result = data.parsed
      if (!result?.shots?.length) {
        setParsed(null)
        setParseError(t('llmFailed'))
        return
      }
      setParsed(result)
      setSpeaker(result.speaker)
      setNovelTextExtra(result.novelText ?? '')
    } catch (e) {
      setParsed(null)
      setParseError(e instanceof Error ? e.message : t('networkError'))
    } finally {
      setLlmParsing(false)
    }
  }, [paste, projectId, t])

  const invalidateCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.voiceLines.all(episodeId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.voiceLines.matched(projectId, episodeId) })
  }, [queryClient, projectId, episodeId])

  const handleSubmit = useCallback(async () => {
    if (!parsed || !storyboardId) return
    setSubmitting(true)
    setSubmitError(null)
    const novelTextMerged = novelTextExtra.trim() || undefined
    try {
      const res = await apiFetch(`/api/novel-promotion/${projectId}/import-shotlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeId,
          storyboardId,
          speaker: speaker.trim() || '旁白',
          ...(novelTextMerged ? { novelText: novelTextMerged } : {}),
          shots: parsed.shots.map((s) => ({
            durationSec: s.durationSec,
            narration: s.narration,
            description: s.description,
            subtitle: s.subtitle,
            shotType: s.shotType,
            srtStart: s.srtStart,
            srtEnd: s.srtEnd,
          })),
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        setSubmitError(resolveTaskErrorMessage(payload, t('failed')))
        return
      }
      await res.json().catch(() => null)
      invalidateCaches()
      onClose()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : t('networkError'))
    } finally {
      setSubmitting(false)
    }
  }, [
    parsed,
    storyboardId,
    episodeId,
    projectId,
    speaker,
    novelTextExtra,
    invalidateCaches,
    onClose,
    t,
  ])

  if (!isOpen || typeof document === 'undefined') {
    return null
  }

  const canSubmit = Boolean(parsed && storyboardId && !submitting)
  const noStoryboards = storyboardOptions.length === 0

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${baseId}-title`}
    >
      <GlassSurface variant="elevated" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={`${baseId}-title`} className="text-base font-semibold text-[var(--glass-text-primary)]">
            {t('title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]"
            aria-label={t('close')}
          >
            <AppIcon name="close" className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 text-sm text-[var(--glass-text-secondary)]">{t('hint')}</p>

        {noStoryboards ? (
          <p className="text-sm text-[var(--glass-tone-warning-fg)]">{t('noStoryboard')}</p>
        ) : (
          <>
            <label className="mb-1 block text-xs text-[var(--glass-text-secondary)]" htmlFor={`${baseId}-sb`}>
              {t('targetGroup')}
            </label>
            <select
              id={`${baseId}-sb`}
              value={storyboardId}
              onChange={(e) => setStoryboardId(e.target.value)}
              className="mb-3 w-full rounded-lg border border-[var(--glass-stroke-strong)] bg-[var(--glass-bg-canvas)] px-3 py-2 text-sm text-[var(--glass-text-primary)]"
            >
              {storyboardOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>

            <label className="mb-1 block text-xs text-[var(--glass-text-secondary)]" htmlFor={`${baseId}-sp`}>
              {t('speaker')}
            </label>
            <input
              id={`${baseId}-sp`}
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              className="mb-3 w-full rounded-lg border border-[var(--glass-stroke-strong)] bg-[var(--glass-bg-canvas)] px-3 py-2 text-sm text-[var(--glass-text-primary)]"
            />

            <label className="mb-1 block text-xs text-[var(--glass-text-secondary)]" htmlFor={`${baseId}-paste`}>
              {t('pasteLabel')}
            </label>
            <textarea
              id={`${baseId}-paste`}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={10}
              placeholder={t('pastePlaceholder')}
              className="mb-2 w-full resize-y rounded-lg border border-[var(--glass-stroke-strong)] bg-[var(--glass-bg-canvas)] p-3 font-mono text-sm text-[var(--glass-text-primary)]"
            />

            <div className="mb-3 flex flex-wrap gap-2">
              <GlassButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleParse}
                disabled={!paste.trim() || llmParsing}
              >
                {t('parse')}
              </GlassButton>
              <GlassButton
                type="button"
                variant="secondary"
                size="sm"
                loading={llmParsing}
                onClick={() => void handleLlmParse()}
                disabled={!paste.trim() || llmParsing}
              >
                {t('llmParse')}
              </GlassButton>
            </div>

            {parseError ? (
              <p className="mb-2 text-sm text-[var(--glass-tone-danger-fg)]">{parseError}</p>
            ) : null}

            {parsed ? (
              <p className="mb-2 text-sm text-[var(--glass-text-secondary)]">
                {t('preview', { count: parsed.shots.length })}
              </p>
            ) : null}

            <label className="mb-1 block text-xs text-[var(--glass-text-secondary)]" htmlFor={`${baseId}-novel`}>
              {t('novelTextLabel')}
            </label>
            <textarea
              id={`${baseId}-novel`}
              value={novelTextExtra}
              onChange={(e) => setNovelTextExtra(e.target.value)}
              rows={4}
              placeholder={t('novelTextPlaceholder')}
              className="mb-4 w-full resize-y rounded-lg border border-[var(--glass-stroke-strong)] bg-[var(--glass-bg-canvas)] p-3 text-sm text-[var(--glass-text-primary)]"
            />

            {submitError ? (
              <p className="mb-2 text-sm text-[var(--glass-tone-danger-fg)]">{submitError}</p>
            ) : null}

            <div className="flex justify-end gap-2">
              <GlassButton type="button" variant="ghost" onClick={onClose} disabled={submitting || llmParsing}>
                {t('cancel')}
              </GlassButton>
              <GlassButton
                type="button"
                variant="primary"
                loading={submitting}
                onClick={() => void handleSubmit()}
                disabled={!canSubmit || llmParsing || submitting}
              >
                {t('import')}
              </GlassButton>
            </div>
          </>
        )}
      </GlassSurface>
    </div>,
    document.body,
  )
}
