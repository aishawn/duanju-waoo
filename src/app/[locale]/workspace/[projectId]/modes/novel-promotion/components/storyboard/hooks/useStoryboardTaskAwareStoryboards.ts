'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { NovelPromotionStoryboard } from '@/types/project'
import { useStoryboardTaskPresentation } from '@/lib/query/hooks/useTaskPresentation'
import { queryKeys } from '@/lib/query/keys'
import type { TaskTargetState } from '@/lib/query/hooks/useTaskTargetStateMap'

interface TaskTarget {
  key: string
  targetType: string
  targetId: string
  types: string[]
  resource: 'text' | 'image' | 'video'
  hasOutput: boolean
}

interface UseStoryboardTaskAwareStoryboardsProps {
  projectId: string
  /** Used to refetch episode payload when async tasks finish (SSE may be unavailable). */
  episodeId: string
  initialStoryboards: NovelPromotionStoryboard[]
  isRunningPhase: (phase: string | null | undefined) => boolean
}

function buildStoryboardTextTargets(storyboards: NovelPromotionStoryboard[]): TaskTarget[] {
  const targets: TaskTarget[] = []

  for (const storyboard of storyboards) {
    targets.push({
      key: `storyboard:${storyboard.id}`,
      targetType: 'NovelPromotionStoryboard',
      targetId: storyboard.id,
      types: ['regenerate_storyboard_text', 'insert_panel'],
      resource: 'text',
      hasOutput: !!(storyboard.panels || []).length,
    })
    if (storyboard.episodeId) {
      targets.push({
        key: `episode:${storyboard.episodeId}`,
        targetType: 'NovelPromotionEpisode',
        targetId: storyboard.episodeId,
        types: ['regenerate_storyboard_text', 'insert_panel'],
        resource: 'text',
        hasOutput: !!(storyboard.panels || []).length,
      })
    }
  }

  return targets
}

function buildPanelTargets(storyboards: NovelPromotionStoryboard[], type: 'image' | 'video' | 'lip-sync'): TaskTarget[] {
  const targets: TaskTarget[] = []

  for (const storyboard of storyboards) {
    for (const panel of storyboard.panels || []) {
      if (type === 'image') {
        targets.push({
          key: `panel-image:${panel.id}`,
          targetType: 'NovelPromotionPanel',
          targetId: panel.id,
          types: ['image_panel', 'panel_variant', 'modify_asset_image'],
          resource: 'image',
          hasOutput: !!panel.imageUrl,
        })
      } else if (type === 'video') {
        targets.push({
          key: `panel-video:${panel.id}`,
          targetType: 'NovelPromotionPanel',
          targetId: panel.id,
          types: ['video_panel'],
          resource: 'video',
          hasOutput: !!panel.videoUrl,
        })
      } else {
        targets.push({
          key: `panel-lip:${panel.id}`,
          targetType: 'NovelPromotionPanel',
          targetId: panel.id,
          types: ['lip_sync'],
          resource: 'video',
          hasOutput: !!panel.lipSyncVideoUrl,
        })
      }
    }
  }

  return targets
}

export function useStoryboardTaskAwareStoryboards({
  projectId,
  episodeId,
  initialStoryboards,
  isRunningPhase,
}: UseStoryboardTaskAwareStoryboardsProps) {
  const queryClient = useQueryClient()
  const prevPanelTaskPhasesRef = useRef<Record<string, TaskTargetState['phase']>>({})
  const storyboardTextTargets = useMemo(
    () => buildStoryboardTextTargets(initialStoryboards),
    [initialStoryboards],
  )
  const panelImageTargets = useMemo(
    () => buildPanelTargets(initialStoryboards, 'image'),
    [initialStoryboards],
  )
  const panelVideoTargets = useMemo(
    () => buildPanelTargets(initialStoryboards, 'video'),
    [initialStoryboards],
  )
  const panelLipSyncTargets = useMemo(
    () => buildPanelTargets(initialStoryboards, 'lip-sync'),
    [initialStoryboards],
  )

  const storyboardTextStates = useStoryboardTaskPresentation(
    projectId,
    storyboardTextTargets,
    !!projectId && storyboardTextTargets.length > 0,
  )
  const panelImageStates = useStoryboardTaskPresentation(
    projectId,
    panelImageTargets,
    !!projectId && panelImageTargets.length > 0,
  )
  const panelVideoStates = useStoryboardTaskPresentation(
    projectId,
    panelVideoTargets,
    !!projectId && panelVideoTargets.length > 0,
  )
  const panelLipSyncStates = useStoryboardTaskPresentation(
    projectId,
    panelLipSyncTargets,
    !!projectId && panelLipSyncTargets.length > 0,
  )

  useEffect(() => {
    if (!projectId || !episodeId) return
    let shouldInvalidateEpisode = false
    for (const storyboard of initialStoryboards) {
      for (const panel of storyboard.panels || []) {
        const trackers: Array<{ key: string; phase: TaskTargetState['phase'] | undefined }> = [
          {
            key: `panel-image:${panel.id}`,
            phase: panelImageStates.getTaskState(`panel-image:${panel.id}`)?.phase,
          },
          {
            key: `panel-video:${panel.id}`,
            phase: panelVideoStates.getTaskState(`panel-video:${panel.id}`)?.phase,
          },
          {
            key: `panel-lip:${panel.id}`,
            phase: panelLipSyncStates.getTaskState(`panel-lip:${panel.id}`)?.phase,
          },
        ]
        for (const { key, phase } of trackers) {
          if (phase == null) continue
          const prev = prevPanelTaskPhasesRef.current[key]
          const wasRunning = prev === 'queued' || prev === 'processing'
          const isRunning = phase === 'queued' || phase === 'processing'
          if (wasRunning && !isRunning) shouldInvalidateEpisode = true
          prevPanelTaskPhasesRef.current[key] = phase
        }
      }
    }
    if (shouldInvalidateEpisode) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
    }
  }, [
    episodeId,
    initialStoryboards,
    panelImageStates,
    panelLipSyncStates,
    panelVideoStates,
    projectId,
    queryClient,
  ])

  const taskAwareStoryboards = useMemo(() => {
    return initialStoryboards.map((storyboard) => ({
      ...storyboard,
      storyboardTaskRunning:
        isRunningPhase(storyboardTextStates.getTaskState(`storyboard:${storyboard.id}`)?.phase) ||
        isRunningPhase(storyboardTextStates.getTaskState(`episode:${storyboard.episodeId}`)?.phase),
      panels: (storyboard.panels || []).map((panel) => {
        const panelImageTaskState = panelImageStates.getTaskState(`panel-image:${panel.id}`)
        const panelImageRunning = isRunningPhase(panelImageTaskState?.phase)
        return {
          ...panel,
          imageTaskRunning: panelImageRunning,
          imageTaskIntent: panelImageTaskState?.intent,
          videoTaskRunning: isRunningPhase(panelVideoStates.getTaskState(`panel-video:${panel.id}`)?.phase),
          lipSyncTaskRunning: isRunningPhase(panelLipSyncStates.getTaskState(`panel-lip:${panel.id}`)?.phase),
        }
      }),
    }))
  }, [
    initialStoryboards,
    isRunningPhase,
    panelImageStates,
    panelLipSyncStates,
    panelVideoStates,
    storyboardTextStates,
  ])

  return {
    taskAwareStoryboards,
  }
}
