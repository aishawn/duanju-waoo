// ========================================
// Video Editor Module - Public API
// ========================================

// Types
export type {
    VideoEditorProject,
    VideoClip,
    BgmClip,
    ClipAttachment,
    ClipTransition,
    ClipMetadata,
    EditorConfig,
    TimelineState,
    ComputedClip,
    SaveEditorProjectRequest,
    RenderRequest,
    RenderStatus
} from './types/editor.types'

// Utils
export {
    calculateTimelineDuration,
    computeClipPositions,
    framesToTime,
    timeToFrames,
    generateClipId,
    createDefaultProject
} from './utils/time-utils'

export {
    migrateProjectData,
    validateProjectData
} from './utils/migration'

// Components
export { VideoEditorStage } from './components/VideoEditorStage'
export { TransitionPicker } from './components/TransitionPicker'
export { MediaLibraryPanel } from './components/MediaLibraryPanel'
export type { MediaAsset } from './components/MediaLibraryPanel'
export { BgmLibraryPicker } from './components/BgmLibraryPicker'

// Hooks
export { useEditorState } from './hooks/useEditorState'
export { useEditorActions, createProjectFromPanels } from './hooks/useEditorActions'
