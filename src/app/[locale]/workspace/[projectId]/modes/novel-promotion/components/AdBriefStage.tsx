'use client'

/**
 * 广告/TVC模式 - Brief输入阶段
 *
 * 功能：
 * - 结构化表单输入广告Brief（品牌/产品/卖点/受众/情绪/时长/类型）
 * - 提交后触发 AI 生成广告脚本（异步任务）
 * - 脚本生成完成后跳转到分镜阶段
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import type { AdBrief, AdEmotionTone, AdType } from '@/types/project'
import { apiFetch } from '@/lib/api-fetch'

interface AdBriefStageProps {
  projectId: string
  episodeId: string
  initialBrief?: Partial<AdBrief>
  onScriptGenerated?: () => void  // 脚本生成完成后的回调（跳转分镜）
}

// 情绪基调选项
const EMOTION_TONES: { value: AdEmotionTone; emoji: string; labelKey: string }[] = [
  { value: 'energetic', emoji: '⚡', labelKey: 'energetic' },
  { value: 'warm', emoji: '🌅', labelKey: 'warm' },
  { value: 'tech', emoji: '🔬', labelKey: 'tech' },
  { value: 'elegant', emoji: '💎', labelKey: 'elegant' },
  { value: 'joyful', emoji: '🎉', labelKey: 'joyful' },
  { value: 'inspiring', emoji: '🚀', labelKey: 'inspiring' },
]

// 广告类型选项
const AD_TYPES: { value: AdType; labelKey: string }[] = [
  { value: 'tvc', labelKey: 'tvc' },
  { value: 'social_media', labelKey: 'social_media' },
  { value: 'product_demo', labelKey: 'product_demo' },
  { value: 'brand_story', labelKey: 'brand_story' },
]

// 时长选项
const DURATIONS: { value: 15 | 30 | 60; labelKey: string }[] = [
  { value: 15, labelKey: '15' },
  { value: 30, labelKey: '30' },
  { value: 60, labelKey: '60' },
]

export default function AdBriefStage({
  projectId,
  episodeId,
  initialBrief,
  onScriptGenerated,
}: AdBriefStageProps) {
  const t = useTranslations('adBrief')

  // Brief 表单状态
  const [brandName, setBrandName] = useState(initialBrief?.brandName ?? '')
  const [productName, setProductName] = useState(initialBrief?.productName ?? '')
  const [keySellingPoints, setKeySellingPoints] = useState<string[]>(
    initialBrief?.keySellingPoints ?? [''],
  )
  const [targetAudience, setTargetAudience] = useState(initialBrief?.targetAudience ?? '')
  const [emotionTone, setEmotionTone] = useState<AdEmotionTone | ''>(
    initialBrief?.emotionTone ?? '',
  )
  const [adType, setAdType] = useState<AdType | ''>(initialBrief?.adType ?? '')
  const [durationSec, setDurationSec] = useState<15 | 30 | 60>(initialBrief?.durationSec ?? 30)
  const [referenceStyle, setReferenceStyle] = useState(initialBrief?.referenceStyle ?? '')
  const [slogan, setSlogan] = useState(initialBrief?.slogan ?? '')

  // UI 状态
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // 自动保存状态
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── 自动保存 ──────────────────────────────
  const saveDraft = useCallback(async (brief: Partial<AdBrief>) => {
    setAutoSaveState('saving')
    try {
      const res = await apiFetch(
        `/api/novel-promotion/${projectId}/episodes/${episodeId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ adBriefData: brief }),
        }
      )
      if (!res.ok) throw new Error('save failed')
      setAutoSaveState('saved')
    } catch {
      setAutoSaveState('error')
    }
  }, [projectId, episodeId])

  // 监听所有表单字段变化，debounce 1.5s 后自动保存
  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      void saveDraft({
        brandName: brandName.trim() || undefined,
        productName: productName.trim() || undefined,
        keySellingPoints: keySellingPoints.filter(p => p.trim()),
        targetAudience: targetAudience.trim() || undefined,
        emotionTone: emotionTone || undefined,
        durationSec,
        adType: adType || undefined,
        referenceStyle: referenceStyle.trim() || undefined,
        slogan: slogan.trim() || undefined,
      })
    }, 1500)
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandName, productName, keySellingPoints, targetAudience, emotionTone, durationSec, adType, referenceStyle, slogan])

  // 卖点管理
  const addSellingPoint = useCallback(() => {
    if (keySellingPoints.length < 5) {
      setKeySellingPoints(prev => [...prev, ''])
    }
  }, [keySellingPoints.length])

  const updateSellingPoint = useCallback((index: number, value: string) => {
    setKeySellingPoints(prev => prev.map((p, i) => i === index ? value : p))
  }, [])

  const removeSellingPoint = useCallback((index: number) => {
    setKeySellingPoints(prev => prev.filter((_, i) => i !== index))
  }, [])

  // 表单验证
  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {}
    if (!brandName.trim()) errors.brandName = t('validation.brandNameRequired')
    if (!productName.trim()) errors.productName = t('validation.productNameRequired')
    if (!targetAudience.trim()) errors.targetAudience = t('validation.targetAudienceRequired')
    if (keySellingPoints.filter(p => p.trim()).length === 0) errors.sellingPoints = t('validation.sellingPointRequired')
    if (!emotionTone) errors.emotionTone = t('validation.emotionToneRequired')
    if (!adType) errors.adType = t('validation.adTypeRequired')
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }, [brandName, productName, targetAudience, keySellingPoints, emotionTone, adType, t])

  // 提交生成
  const handleGenerate = useCallback(async () => {
    if (!validate()) return
    setIsGenerating(true)
    setError(null)

    const brief: AdBrief = {
      brandName: brandName.trim(),
      productName: productName.trim(),
      keySellingPoints: keySellingPoints.filter(p => p.trim()),
      targetAudience: targetAudience.trim(),
      emotionTone: emotionTone as AdEmotionTone,
      durationSec,
      adType: adType as AdType,
      referenceStyle: referenceStyle.trim() || undefined,
      slogan: slogan.trim() || undefined,
    }

    try {
      const res = await apiFetch(`/api/novel-promotion/${projectId}/ad-brief-to-script`, {
        method: 'POST',
        body: JSON.stringify({ episodeId, brief }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || `HTTP ${res.status}`)
      }

      // 任务已提交，等待完成后跳转（通过任务状态轮询或 SSE）
      // 当前简化处理：提交后由父组件的任务状态系统处理跳转
      onScriptGenerated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试')
    } finally {
      setIsGenerating(false)
    }
  }, [validate, brandName, productName, keySellingPoints, targetAudience, emotionTone, durationSec, adType, referenceStyle, slogan, projectId, episodeId, onScriptGenerated])

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto">
      {/* 标题 */}
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[var(--glass-text-primary)]">{t('title')}</h2>
          {/* 自动保存状态指示 */}
          {autoSaveState !== 'idle' && (
            <span
              className="text-xs transition-colors duration-300"
              style={{
                color: autoSaveState === 'saving'
                  ? 'var(--glass-text-tertiary)'
                  : autoSaveState === 'saved'
                    ? 'var(--glass-tone-success-fg)'
                    : 'var(--glass-tone-danger-fg)',
              }}
            >
              {autoSaveState === 'saving' ? t('autosave.saving')
                : autoSaveState === 'saved' ? t('autosave.saved')
                : t('autosave.error')}
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--glass-text-tertiary)] mt-1">{t('subtitle')}</p>
      </div>

      {/* 品牌名称 */}
      <FormField label={t('form.brandName')} error={validationErrors.brandName}>
        <input
          type="text"
          className={inputClass(!!validationErrors.brandName)}
          placeholder={t('form.brandNamePlaceholder')}
          value={brandName}
          onChange={e => setBrandName(e.target.value)}
        />
      </FormField>

      {/* 产品/服务 */}
      <FormField label={t('form.productName')} error={validationErrors.productName}>
        <input
          type="text"
          className={inputClass(!!validationErrors.productName)}
          placeholder={t('form.productNamePlaceholder')}
          value={productName}
          onChange={e => setProductName(e.target.value)}
        />
      </FormField>

      {/* 核心卖点 */}
      <FormField label={t('form.keySellingPoints')} error={validationErrors.sellingPoints}>
        <div className="flex flex-col gap-2">
          {keySellingPoints.map((point, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                type="text"
                className={inputClass(false) + ' flex-1'}
                placeholder={t('form.keySellingPointsPlaceholder')}
                value={point}
                onChange={e => updateSellingPoint(idx, e.target.value)}
              />
              {keySellingPoints.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSellingPoint(idx)}
                  className="text-[var(--glass-text-tertiary)] hover:text-[var(--glass-tone-danger-fg)] px-2 transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {keySellingPoints.length < 5 && (
            <button
              type="button"
              onClick={addSellingPoint}
              className="text-sm text-left font-medium text-[var(--glass-tone-info-fg)] hover:opacity-90 transition-opacity"
            >
              {t('form.addSellingPoint')}
            </button>
          )}
        </div>
      </FormField>

      {/* 目标受众 */}
      <FormField label={t('form.targetAudience')} error={validationErrors.targetAudience}>
        <input
          type="text"
          className={inputClass(!!validationErrors.targetAudience)}
          placeholder={t('form.targetAudiencePlaceholder')}
          value={targetAudience}
          onChange={e => setTargetAudience(e.target.value)}
        />
      </FormField>

      {/* 情绪基调 */}
      <FormField label={t('form.emotionTone')} error={validationErrors.emotionTone}>
        <div className="grid grid-cols-3 gap-2">
          {EMOTION_TONES.map(tone => (
            <button
              key={tone.value}
              type="button"
              onClick={() => setEmotionTone(tone.value)}
              className={`
                px-3 py-2 rounded-lg text-sm font-medium transition-all border
                ${emotionTone === tone.value
                  ? 'bg-[var(--glass-tone-info-bg)] border-[var(--glass-stroke-focus)] text-[var(--glass-tone-info-fg)]'
                  : 'bg-[var(--glass-bg-muted)] border-[var(--glass-stroke-base)] text-[var(--glass-text-secondary)] hover:border-[var(--glass-stroke-strong)]'
                }
              `}
            >
              {t(`emotionTone.${tone.labelKey}`)}
            </button>
          ))}
        </div>
      </FormField>

      {/* 广告类型 + 时长（两列） */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label={t('form.adType')} error={validationErrors.adType}>
          <div className="flex flex-col gap-1.5">
            {AD_TYPES.map(type => (
              <button
                key={type.value}
                type="button"
                onClick={() => setAdType(type.value)}
                className={`
                  px-3 py-2 rounded-lg text-sm text-left transition-all border
                  ${adType === type.value
                    ? 'bg-[color:rgba(124,58,237,0.15)] border-[color:rgba(124,58,237,0.45)] text-[color:#5b21b6]'
                    : 'bg-[var(--glass-bg-muted)] border-[var(--glass-stroke-base)] text-[var(--glass-text-secondary)] hover:border-[var(--glass-stroke-strong)]'
                  }
                `}
              >
                {t(`adType.${type.labelKey}`)}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label={t('form.duration')}>
          <div className="flex flex-col gap-1.5">
            {DURATIONS.map(d => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDurationSec(d.value)}
                className={`
                  px-3 py-2 rounded-lg text-sm text-left transition-all border
                  ${durationSec === d.value
                    ? 'bg-[var(--glass-tone-success-bg)] border-[var(--glass-stroke-success)] text-[var(--glass-tone-success-fg)]'
                    : 'bg-[var(--glass-bg-muted)] border-[var(--glass-stroke-base)] text-[var(--glass-text-secondary)] hover:border-[var(--glass-stroke-strong)]'
                  }
                `}
              >
                {t(`duration.${d.labelKey}`)}
              </button>
            ))}
          </div>
        </FormField>
      </div>

      {/* 参考风格（可选） */}
      <FormField label={t('form.referenceStyle')}>
        <input
          type="text"
          className={inputClass(false)}
          placeholder={t('form.referenceStylePlaceholder')}
          value={referenceStyle}
          onChange={e => setReferenceStyle(e.target.value)}
        />
      </FormField>

      {/* 品牌口号（可选） */}
      <FormField label={t('form.slogan')}>
        <input
          type="text"
          className={inputClass(false)}
          placeholder={t('form.sloganPlaceholder')}
          value={slogan}
          onChange={e => setSlogan(e.target.value)}
        />
      </FormField>

      {/* 制作提示 */}
      <div className="rounded-xl border p-4 bg-[var(--glass-tone-info-bg)] border-[var(--glass-stroke-base)]">
        <p className="text-xs font-semibold text-[var(--glass-tone-info-fg)] mb-2">{t('tips.title')}</p>
        <ul className="space-y-1">
          {(['tip1', 'tip2', 'tip3', 'tip4'] as const).map(tip => (
            <li key={tip} className="text-xs text-[var(--glass-text-secondary)]">
              {t(`tips.${tip}`)}
            </li>
          ))}
        </ul>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-lg border p-3 text-sm bg-[var(--glass-tone-danger-bg)] border-[var(--glass-stroke-danger)] text-[var(--glass-tone-danger-fg)]">
          {error}
        </div>
      )}

      {/* 提交按钮 */}
      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={isGenerating}
        className={`
          w-full py-3 px-6 rounded-xl font-semibold text-white transition-all
          ${isGenerating
            ? 'bg-gray-700 cursor-not-allowed opacity-60'
            : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-lg hover:shadow-blue-500/25'
          }
        `}
      >
        {isGenerating ? t('actions.generating') : t('actions.generateScript')}
      </button>
    </div>
  )
}

// ── 辅助组件 ──

function FormField({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{label}</label>
      {children}
      {error && <p className="text-xs text-[var(--glass-tone-danger-fg)]">{error}</p>}
    </div>
  )
}

function inputClass(hasError: boolean): string {
  return [
    'w-full px-3 py-2 rounded-lg text-sm text-[var(--glass-text-primary)] bg-[var(--glass-bg-surface)]',
    'border transition-colors outline-none',
    hasError
      ? 'border-[var(--glass-stroke-danger)] focus:border-[var(--glass-stroke-danger)]'
      : 'border-[var(--glass-stroke-base)] focus:border-[var(--glass-stroke-focus)]',
    'placeholder:text-[var(--glass-text-tertiary)]',
  ].join(' ')
}
