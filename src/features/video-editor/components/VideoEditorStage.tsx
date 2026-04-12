'use client'
import { logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

import React, { useMemo, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useEditorState } from '../hooks/useEditorState'
import { useEditorActions } from '../hooks/useEditorActions'
import { VideoEditorProject } from '../types/editor.types'
import { calculateTimelineDuration, framesToTime } from '../utils/time-utils'
import { RemotionPreview } from './Preview'
import { Timeline } from './Timeline'
import { TransitionPicker, TransitionType } from './TransitionPicker'
import { MediaLibraryPanel, type MediaAsset } from './MediaLibraryPanel'
import { BgmLibraryPicker } from './BgmLibraryPicker'

interface VideoEditorStageProps {
    projectId: string
    episodeId: string
    initialProject?: VideoEditorProject
    onBack?: () => void
}

/**
 * 视频编辑器主页面
 * 
 * 布局:
 * ┌──────────────────────────────────────────────────────────┐
 * │ Toolbar (返回 | 保存 | 导出)                              │
 * ├──────────────┬───────────────────────────────────────────┤
 * │  素材库       │       Preview (Remotion Player)           │
 * │              │                                           │
 * │              ├───────────────────────────────────────────┤
 * │              │       Properties Panel                    │
 * ├──────────────┴───────────────────────────────────────────┤
 * │                      Timeline                            │
 * └──────────────────────────────────────────────────────────┘
 */
export function VideoEditorStage({
    projectId,
    episodeId,
    initialProject,
    onBack
}: VideoEditorStageProps) {
    const t = useTranslations('video')
    const {
        project,
        timelineState,
        isDirty,
        addClip,
        removeClip,
        updateClip,
        reorderClips,
        addBgm,
        removeBgm,
        play,
        pause,
        seek,
        selectClip,
        setZoom,
        markSaved
    } = useEditorState({ episodeId, initialProject })

    const { saveProject, startRender } = useEditorActions({ projectId, episodeId })

    const totalDuration = calculateTimelineDuration(project.timeline)
    const totalTime = framesToTime(totalDuration, project.config.fps)
    const currentTime = framesToTime(timelineState.currentFrame, project.config.fps)

    const [leftTab, setLeftTab] = useState<'media' | 'bgm'>('media')

    // ── 素材库：从 initialProject 中提取有效视频素材 ──────────────
    const mediaAssets = useMemo<MediaAsset[]>(() => {
        if (!initialProject) return []
        return initialProject.timeline
            .filter((clip) => clip.src)
            .map((clip) => ({
                id: clip.metadata.panelId,
                src: clip.src,
                durationInFrames: clip.durationInFrames,
                description: clip.metadata.description,
                storyboardId: clip.metadata.storyboardId,
                panelIndex: 0,
            }))
    }, [initialProject])

    const usedPanelIds = useMemo<Set<string>>(
        () => new Set(project.timeline.map((c) => c.metadata.panelId)),
        [project.timeline]
    )

    const handleSave = async () => {
        try {
            await saveProject(project)
            markSaved()
            alert(t('editor.alert.saveSuccess'))
        } catch (error) {
            _ulogError('Save failed:', error)
            alert(t('editor.alert.saveFailed'))
        }
    }

    const handleExport = async () => {
        try {
            await startRender(project.id)
            alert(t('editor.alert.exportStarted'))
        } catch (error) {
            _ulogError('Export failed:', error)
            alert(t('editor.alert.exportFailed'))
        }
    }

    const selectedClip = project.timeline.find(c => c.id === timelineState.selectedClipId)

    return (
        <div className="video-editor-stage" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: 'var(--glass-bg-canvas)',
            color: 'var(--glass-text-primary)'
        }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderBottom: '1px solid var(--glass-stroke-base)',
                background: 'var(--glass-bg-surface)'
            }}>
                <button
                    onClick={onBack}
                    className="glass-btn-base glass-btn-secondary px-4 py-2"
                >
                    {t('editor.toolbar.back')}
                </button>

                <div style={{ flex: 1 }} />

                <span style={{ color: 'var(--glass-text-secondary)', fontSize: '14px' }}>
                    {currentTime} / {totalTime}
                </span>

                <button
                    onClick={handleSave}
                    className={`glass-btn-base px-4 py-2 ${isDirty ? 'glass-btn-primary text-white' : 'glass-btn-secondary'}`}
                >
                    {isDirty ? t('editor.toolbar.saveDirty') : t('editor.toolbar.saved')}
                </button>

                <button
                    onClick={handleExport}
                    className="glass-btn-base glass-btn-tone-success px-4 py-2"
                >
                    {t('editor.toolbar.export')}
                </button>
            </div>

            {/* Main Content */}
            <div style={{
                display: 'flex',
                flex: 1,
                overflow: 'hidden'
            }}>
                {/* Left Panel - 素材库 / BGM 双标签页 */}
                <div style={{
                    width: '220px',
                    borderRight: '1px solid var(--glass-stroke-base)',
                    background: 'var(--glass-bg-surface-strong)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}>
                    {/* 标签栏 */}
                    <div style={{
                        display: 'flex',
                        borderBottom: '1px solid var(--glass-stroke-base)',
                        flexShrink: 0,
                    }}>
                        {(['media', 'bgm'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setLeftTab(tab)}
                                style={{
                                    flex: 1,
                                    padding: '8px 0',
                                    fontSize: '12px',
                                    fontWeight: leftTab === tab ? 600 : 400,
                                    border: 'none',
                                    borderBottom: leftTab === tab
                                        ? '2px solid var(--glass-accent-from)'
                                        : '2px solid transparent',
                                    background: 'transparent',
                                    color: leftTab === tab
                                        ? 'var(--glass-accent-from)'
                                        : 'var(--glass-text-secondary)',
                                    cursor: 'pointer',
                                }}
                            >
                                {tab === 'media' ? t('editor.left.title') : 'BGM'}
                            </button>
                        ))}
                    </div>

                    {/* 内容区 */}
                    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {leftTab === 'media' ? (
                            <MediaLibraryPanel
                                assets={mediaAssets}
                                usedPanelIds={usedPanelIds}
                                onAddClip={addClip}
                            />
                        ) : (
                            <BgmLibraryPicker
                                usedBgmIds={new Set(project.bgmTrack.map((b) => b.id))}
                                totalFrames={totalDuration}
                                fps={project.config.fps}
                                onAddBgm={addBgm}
                            />
                        )}
                    </div>
                </div>

                {/* Center - Preview + Properties */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {/* Preview */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--glass-bg-muted)',
                        padding: '20px'
                    }}>
                        <RemotionPreview
                            project={project}
                            currentFrame={timelineState.currentFrame}
                            playing={timelineState.playing}
                            onFrameChange={seek}
                            onPlayingChange={(playing) => playing ? play() : pause()}
                        />
                    </div>

                    {/* Playback Controls */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '16px',
                        padding: '12px',
                        background: 'var(--glass-bg-surface-strong)',
                        borderTop: '1px solid var(--glass-stroke-base)'
                    }}>
                        <button
                            onClick={() => seek(0)}
                            className="glass-btn-base glass-btn-ghost px-3 py-1.5"
                        >
                            <AppIcon name="chevronLeft" className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => timelineState.playing ? pause() : play()}
                            style={{
                                background: 'var(--glass-accent-from)',
                                border: 'none',
                                color: 'var(--glass-text-on-accent)',
                                cursor: 'pointer',
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                fontSize: '18px'
                            }}
                        >
                            {timelineState.playing
                                ? <AppIcon name="pause" className="w-4 h-4" />
                                : <AppIcon name="play" className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => seek(totalDuration)}
                            className="glass-btn-base glass-btn-ghost px-3 py-1.5"
                        >
                            <AppIcon name="chevronRight" className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Right Panel - Properties */}
                <div style={{
                    width: '280px',
                    borderLeft: '1px solid var(--glass-stroke-base)',
                    padding: '12px',
                    background: 'var(--glass-bg-surface-strong)',
                    overflowY: 'auto'
                }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--glass-text-secondary)' }}>
                        {t('editor.right.title')}
                    </h3>
                    {selectedClip ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* 基础信息 */}
                            <div style={{ fontSize: '12px' }}>
                                <p style={{ margin: '0 0 4px 0' }}>
                                    <span style={{ color: 'var(--glass-text-secondary)' }}>{t('editor.right.clipLabel')}</span>{' '}
                                    {selectedClip.metadata?.description || t('editor.right.clipFallback', { index: project.timeline.findIndex(c => c.id === selectedClip.id) + 1 })}
                                </p>
                                <p style={{ margin: 0 }}>
                                    <span style={{ color: 'var(--glass-text-secondary)' }}>{t('editor.right.durationLabel')}</span>{' '}
                                    {framesToTime(selectedClip.durationInFrames, project.config.fps)}
                                </p>
                            </div>

                            {/* ── Trim（裁剪入出点） ── */}
                            <div>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--glass-text-secondary)' }}>
                                    {t('editor.right.trimLabel')}
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <label style={{ fontSize: '11px', color: 'var(--glass-text-secondary)' }}>
                                        {t('editor.right.trimFrom')}
                                        <input
                                            type="number"
                                            min={0}
                                            max={selectedClip.trim?.to ?? selectedClip.durationInFrames}
                                            value={selectedClip.trim?.from ?? 0}
                                            onChange={(e) => {
                                                const from = Math.max(0, parseInt(e.target.value) || 0)
                                                updateClip(selectedClip.id, {
                                                    trim: {
                                                        from,
                                                        to: selectedClip.trim?.to ?? selectedClip.durationInFrames
                                                    }
                                                })
                                            }}
                                            style={{
                                                display: 'block', width: '100%', marginTop: '4px',
                                                padding: '4px 6px', fontSize: '12px', borderRadius: '4px',
                                                border: '1px solid var(--glass-stroke-base)',
                                                background: 'var(--glass-bg-muted)',
                                                color: 'var(--glass-text-primary)'
                                            }}
                                        />
                                    </label>
                                    <label style={{ fontSize: '11px', color: 'var(--glass-text-secondary)' }}>
                                        {t('editor.right.trimTo')}
                                        <input
                                            type="number"
                                            min={selectedClip.trim?.from ?? 0}
                                            max={selectedClip.durationInFrames}
                                            value={selectedClip.trim?.to ?? selectedClip.durationInFrames}
                                            onChange={(e) => {
                                                const to = Math.min(selectedClip.durationInFrames, parseInt(e.target.value) || selectedClip.durationInFrames)
                                                updateClip(selectedClip.id, {
                                                    trim: {
                                                        from: selectedClip.trim?.from ?? 0,
                                                        to
                                                    }
                                                })
                                            }}
                                            style={{
                                                display: 'block', width: '100%', marginTop: '4px',
                                                padding: '4px 6px', fontSize: '12px', borderRadius: '4px',
                                                border: '1px solid var(--glass-stroke-base)',
                                                background: 'var(--glass-bg-muted)',
                                                color: 'var(--glass-text-primary)'
                                            }}
                                        />
                                    </label>
                                </div>
                                {/* 裁剪预览条 */}
                                {(() => {
                                    const total = selectedClip.durationInFrames
                                    const from = selectedClip.trim?.from ?? 0
                                    const to = selectedClip.trim?.to ?? total
                                    const leftPct = total > 0 ? (from / total) * 100 : 0
                                    const widthPct = total > 0 ? ((to - from) / total) * 100 : 100
                                    return (
                                        <div style={{
                                            position: 'relative', height: '6px', borderRadius: '3px',
                                            background: 'var(--glass-bg-muted)', marginTop: '8px'
                                        }}>
                                            <div style={{
                                                position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`,
                                                height: '100%', borderRadius: '3px',
                                                background: 'linear-gradient(90deg, var(--glass-accent-from), var(--glass-accent-to))'
                                            }} />
                                        </div>
                                    )
                                })()}
                                {(selectedClip.trim?.from || selectedClip.trim?.to) && (
                                    <button
                                        onClick={() => updateClip(selectedClip.id, { trim: undefined })}
                                        style={{
                                            marginTop: '6px', fontSize: '11px', padding: '2px 8px',
                                            borderRadius: '4px', border: 'none', cursor: 'pointer',
                                            background: 'var(--glass-bg-muted)', color: 'var(--glass-text-secondary)'
                                        }}
                                    >
                                        {t('editor.right.trimReset')}
                                    </button>
                                )}
                            </div>

                            {/* ── 音量调节 ── */}
                            {selectedClip.attachment?.audio && (
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--glass-text-secondary)' }}>
                                        {t('editor.right.volumeLabel')}
                                    </h4>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '12px' }}>🔈</span>
                                        <input
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.05}
                                            value={selectedClip.attachment.audio.volume}
                                            onChange={(e) => {
                                                const volume = parseFloat(e.target.value)
                                                updateClip(selectedClip.id, {
                                                    attachment: {
                                                        ...selectedClip.attachment,
                                                        audio: {
                                                            ...selectedClip.attachment!.audio!,
                                                            volume
                                                        }
                                                    }
                                                })
                                            }}
                                            style={{ flex: 1 }}
                                        />
                                        <span style={{ fontSize: '12px', width: '32px', textAlign: 'right', color: 'var(--glass-text-secondary)' }}>
                                            {Math.round(selectedClip.attachment.audio.volume * 100)}%
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* ── 字幕编辑 ── */}
                            <div>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--glass-text-secondary)' }}>
                                    {t('editor.right.subtitleLabel')}
                                </h4>
                                <textarea
                                    rows={3}
                                    placeholder={t('editor.right.subtitlePlaceholder')}
                                    value={selectedClip.attachment?.subtitle?.text ?? ''}
                                    onChange={(e) => {
                                        const text = e.target.value
                                        updateClip(selectedClip.id, {
                                            attachment: {
                                                ...selectedClip.attachment,
                                                subtitle: text
                                                    ? { text, style: selectedClip.attachment?.subtitle?.style ?? 'default' }
                                                    : undefined
                                            }
                                        })
                                    }}
                                    style={{
                                        width: '100%', padding: '6px 8px', fontSize: '12px',
                                        borderRadius: '4px', border: '1px solid var(--glass-stroke-base)',
                                        background: 'var(--glass-bg-muted)', color: 'var(--glass-text-primary)',
                                        resize: 'vertical', boxSizing: 'border-box', lineHeight: '1.5'
                                    }}
                                />
                                {/* 字幕样式选择 */}
                                {(() => {
                                    const attachment = selectedClip.attachment
                                    const subtitle = attachment?.subtitle
                                    if (!attachment || !subtitle) return null
                                    return (
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                            {(['default', 'cinematic'] as const).map((style) => (
                                                <button
                                                    key={style}
                                                    onClick={() => {
                                                        updateClip(selectedClip.id, {
                                                            attachment: {
                                                                ...attachment,
                                                                subtitle: {
                                                                    text: subtitle.text,
                                                                    style
                                                                }
                                                            }
                                                        })
                                                    }}
                                                    style={{
                                                        padding: '3px 10px', fontSize: '11px', borderRadius: '4px',
                                                        border: 'none', cursor: 'pointer',
                                                        background: subtitle.style === style
                                                            ? 'var(--glass-accent-from)'
                                                            : 'var(--glass-bg-muted)',
                                                        color: subtitle.style === style
                                                            ? 'var(--glass-text-on-accent)'
                                                            : 'var(--glass-text-secondary)'
                                                    }}
                                                >
                                                    {t(`editor.right.subtitleStyle.${style}`)}
                                                </button>
                                            ))}
                                        </div>
                                    )
                                })()}
                            </div>

                            {/* ── 转场设置 ── */}
                            <div>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--glass-text-secondary)' }}>
                                    {t('editor.right.transitionLabel')}
                                </h4>
                                <TransitionPicker
                                    value={(selectedClip.transition?.type as TransitionType) || 'none'}
                                    duration={selectedClip.transition?.durationInFrames || 15}
                                    onChange={(type, duration) => {
                                        updateClip(selectedClip.id, {
                                            transition: type === 'none' ? undefined : { type, durationInFrames: duration }
                                        })
                                    }}
                                />
                            </div>

                            {/* 删除按钮 */}
                            <button
                                onClick={() => {
                                    if (confirm(t('editor.right.deleteConfirm'))) {
                                        removeClip(selectedClip.id)
                                        selectClip(null)
                                    }
                                }}
                                className="glass-btn-base glass-btn-tone-danger mt-2 px-3 py-2 text-xs"
                            >
                                {t('editor.right.deleteClip')}
                            </button>
                        </div>
                    ) : (
                        <p style={{ fontSize: '12px', color: 'var(--glass-text-tertiary)' }}>
                            {t('editor.right.selectClipHint')}
                        </p>
                    )}
                </div>
            </div>

            {/* Timeline */}
            <div style={{
                height: '220px',
                borderTop: '1px solid var(--glass-stroke-base)'
            }}>
                <Timeline
                    clips={project.timeline}
                    bgmTrack={project.bgmTrack}
                    timelineState={timelineState}
                    config={project.config}
                    onReorder={reorderClips}
                    onSelectClip={selectClip}
                    onZoomChange={setZoom}
                    onSeek={seek}
                    onRemoveBgm={removeBgm}
                />
            </div>
        </div>
    )
}

export default VideoEditorStage
