'use client'

import { useCallback, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import NovelInputStage from './NovelInputStage'
import SmartImportWizard from './SmartImportWizard'
import AdBriefStage from './AdBriefStage'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import { useEpisodeData } from '@/lib/query/hooks'
import type { SplitEpisode } from './smart-import/types'
import type { AdBrief } from '@/types/project'

/**
 * 配置阶段 — 整合 NovelInputStage + 长文本智能分集 + 广告Brief输入
 *
 * 顶部 Tab 切换「小说/剧本」和「广告/TVC」两种创作模式：
 * - 小说/剧本：原有 NovelInputStage + SmartImportWizard 流程
 * - 广告/TVC：AdBriefStage（结构化Brief → AI生成广告脚本）
 */
export default function ConfigStage() {
  const runtime = useWorkspaceStageRuntime()
  const { episodeName, novelText } = useWorkspaceEpisodeStageData()
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId ?? ''
  const { episodeId } = useWorkspaceProvider()
  const { data: episodeData } = useEpisodeData(projectId, episodeId || null)
  const t = useTranslations('adBrief')

  // 创作模式切换
  const [mode, setMode] = useState<'novel' | 'adFilm'>('novel')

  // 从 episode 数据中提取已保存的 adBriefData 草稿
  const initialBrief = useMemo<Partial<AdBrief> | undefined>(() => {
    const raw = episodeData?.adBriefData
    if (!raw || typeof raw !== 'string') return undefined
    try { return JSON.parse(raw) as Partial<AdBrief> } catch { return undefined }
  }, [episodeData])

  // 智能分集模式
  const [smartSplitMode, setSmartSplitMode] = useState(false)
  const [smartSplitText, setSmartSplitText] = useState('')

  const handleSmartSplit = useCallback((text: string) => {
    setSmartSplitText(text)
    setSmartSplitMode(true)
  }, [])

  const handleSmartSplitComplete = useCallback((episodes: SplitEpisode[], triggerGlobalAnalysis?: boolean) => {
    void episodes
    void triggerGlobalAnalysis
    window.location.reload()
  }, [])

  // 如果已进入智能分集模式，显示 SmartImportWizard
  if (smartSplitMode) {
    return (
      <SmartImportWizard
        projectId={projectId}
        onManualCreate={() => setSmartSplitMode(false)}
        onImportComplete={handleSmartSplitComplete}
        initialRawContent={smartSplitText}
      />
    )
  }

  return (
    <div className="flex flex-col gap-0">
      {/* 模式切换 Tab */}
      <div
        className="flex border-b pl-6 pt-2"
        style={{ borderColor: 'var(--glass-stroke-base)' }}
      >
        {([
          { key: 'novel', label: t('modeTab.novel') },
          { key: 'adFilm', label: t('modeTab.adFilm') },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            style={{
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: mode === key ? 600 : 400,
              border: 'none',
              borderBottom: mode === key
                ? '2px solid var(--glass-tone-info-fg)'
                : '2px solid transparent',
              background: 'transparent',
              color: mode === key ? 'var(--glass-text-primary)' : 'var(--glass-text-tertiary)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginBottom: '-1px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      {mode === 'novel' ? (
        <NovelInputStage
          novelText={novelText}
          episodeName={episodeName}
          onNovelTextChange={runtime.onNovelTextChange}
          isSubmittingTask={runtime.isSubmittingTTS || runtime.isStartingStoryToScript}
          isSwitchingStage={runtime.isTransitioning}
          videoRatio={runtime.videoRatio ?? undefined}
          artStyle={runtime.artStyle ?? undefined}
          onVideoRatioChange={runtime.onVideoRatioChange}
          onArtStyleChange={runtime.onArtStyleChange}
          onNext={runtime.onRunStoryToScript}
          onSmartSplit={handleSmartSplit}
        />
      ) : (
        episodeId && (
          <AdBriefStage
            projectId={projectId}
            episodeId={episodeId}
            initialBrief={initialBrief}
          />
        )
      )}
    </div>
  )
}
