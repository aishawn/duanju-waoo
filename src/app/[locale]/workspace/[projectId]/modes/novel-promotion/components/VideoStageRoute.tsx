'use client'

import { useState, useCallback, useEffect } from 'react'
import VideoStage from './VideoStage'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import type { Clip as VideoClip } from './video'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import { VideoEditorStage, createProjectFromPanels } from '@/features/video-editor'
import type { VideoEditorProject } from '@/features/video-editor'

interface VideoStageRouteProps {
  /** URL 阶段为 editor 时自动全屏打开剪辑器（需 NEXT_PUBLIC_AI_CLIP_EDITOR_ENABLED=true） */
  startInEditorMode?: boolean
}

export default function VideoStageRoute({ startInEditorMode = false }: VideoStageRouteProps) {
  const runtime = useWorkspaceStageRuntime()
  const { onStageChange } = runtime
  const { projectId, episodeId } = useWorkspaceProvider()
  const { clips, storyboards } = useWorkspaceEpisodeStageData()

  // 编辑器模式：是否全屏显示剪辑编辑器
  const [editorMode, setEditorMode] = useState(false)
  const [initialEditorProject, setInitialEditorProject] = useState<VideoEditorProject | undefined>()

  const normalizedClips: VideoClip[] = clips.map((clip) => ({
    id: clip.id,
    start: clip.start ?? 0,
    end: clip.end ?? 0,
    summary: clip.summary,
  }))

  // 进入编辑器：从已生成的视频面板自动构建初始项目
  const handleEnterEditor = useCallback(() => {
    if (!episodeId) return

    // 汇总所有有视频URL的面板
    const allPanels = storyboards.flatMap((sb) =>
      (sb.panels || []).map((panel) => ({
        id: panel.id,
        panelIndex: panel.panelIndex ?? 0,
        storyboardId: sb.id,
        videoUrl: panel.videoUrl ?? undefined,
        description: panel.description ?? undefined,
        duration: panel.duration ?? undefined,
      }))
    )

    const editorProject = createProjectFromPanels(episodeId, allPanels)
    setInitialEditorProject(editorProject)
    setEditorMode(true)
  }, [episodeId, storyboards])

  useEffect(() => {
    if (!startInEditorMode) return
    handleEnterEditor()
  }, [startInEditorMode, handleEnterEditor])

  const handleExitEditor = useCallback(() => {
    setEditorMode(false)
    setInitialEditorProject(undefined)
    if (startInEditorMode) {
      onStageChange('videos')
    }
  }, [startInEditorMode, onStageChange])

  if (!episodeId) return null

  // 剪辑编辑器全屏覆盖层
  if (editorMode) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          background: 'var(--glass-bg-canvas)',
        }}
      >
        <VideoEditorStage
          projectId={projectId}
          episodeId={episodeId}
          initialProject={initialEditorProject}
          onBack={handleExitEditor}
        />
      </div>
    )
  }

  return (
    <VideoStage
      projectId={projectId}
      episodeId={episodeId}
      storyboards={storyboards}
      clips={normalizedClips}
      defaultVideoModel={runtime.videoModel || ''}
      capabilityOverrides={runtime.capabilityOverrides}
      videoRatio={runtime.videoRatio ?? undefined}
      userVideoModels={runtime.userVideoModels}
      onGenerateVideo={runtime.onGenerateVideo}
      onGenerateAllVideos={runtime.onGenerateAllVideos}
      onBack={() => runtime.onStageChange('storyboard')}
      onUpdateVideoPrompt={runtime.onUpdateVideoPrompt}
      onUpdatePanelVideoModel={runtime.onUpdatePanelVideoModel}
      onOpenAssetLibraryForCharacter={(characterId) =>
        characterId
          ? runtime.onOpenAssetLibraryForCharacter(characterId, false)
          : runtime.onOpenAssetLibrary()
      }
      onEnterEditor={handleEnterEditor}
    />
  )
}
