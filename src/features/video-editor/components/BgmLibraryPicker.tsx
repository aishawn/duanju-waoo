'use client'

/**
 * BGM 曲库选择器
 *
 * 功能：
 * - 按 genre / mood 筛选
 * - 内置预览播放器（点击试听）
 * - 选中后调用 onSelect 将 BgmClip 加入时间轴
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import type { BgmClip } from '../types/editor.types'

// ─────────────────────────────────────────
// 类型
// ─────────────────────────────────────────

interface BgmTrack {
  id: string
  title: string
  artist: string | null
  genre: string
  mood: string
  durationMs: number
  waveformData: number[] | null
  playUrl: string | null
}

interface BgmLibraryPickerProps {
  /** 已加入时间轴的BGM id集合（用于标记已添加） */
  usedBgmIds: Set<string>
  /** 时间轴总帧数（用于计算BGM持续帧数） */
  totalFrames: number
  fps: number
  onAddBgm: (bgm: Omit<BgmClip, 'id'>) => void
}

// ─────────────────────────────────────────
// Genre / Mood 选项
// ─────────────────────────────────────────

const GENRES = ['', 'energetic', 'warm', 'tech', 'elegant', 'joyful', 'inspiring', 'neutral']
const MOODS  = ['', 'upbeat', 'calm', 'dramatic', 'romantic', 'epic', 'motivational']

// ─────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────

export function BgmLibraryPicker({
  usedBgmIds,
  totalFrames,
  fps,
  onAddBgm,
}: BgmLibraryPickerProps) {
  const t = useTranslations('video')
  const [tracks, setTracks]         = useState<BgmTrack[]>([])
  const [loading, setLoading]       = useState(false)
  const [genre, setGenre]           = useState('')
  const [mood, setMood]             = useState('')
  const [search, setSearch]         = useState('')
  const [playingId, setPlayingId]   = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // ── 加载曲库 ─────────────────────────────
  const loadTracks = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (genre) params.set('genre', genre)
      if (mood)  params.set('mood', mood)
      if (search) params.set('q', search)
      const res = await apiFetch(`/api/bgm-library?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTracks(data.tracks ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [genre, mood, search])

  useEffect(() => {
    const t = setTimeout(loadTracks, 300)
    return () => clearTimeout(t)
  }, [loadTracks])

  // ── 播放控制 ─────────────────────────────
  const handlePlay = (track: BgmTrack) => {
    if (!track.playUrl) return

    if (playingId === track.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
    }
    const audio = new Audio(track.playUrl)
    audio.onended = () => setPlayingId(null)
    audio.play()
    audioRef.current = audio
    setPlayingId(track.id)
  }

  // ── 添加到时间轴 ──────────────────────────
  const handleAdd = (track: BgmTrack) => {
    if (!track.playUrl) return
    const durationMs = track.durationMs
    const durationInFrames = Math.round((durationMs / 1000) * fps)

    onAddBgm({
      src: track.playUrl,
      startFrame: 0,
      durationInFrames: Math.min(durationInFrames, totalFrames || durationInFrames),
      volume: 0.8,
      fadeIn: Math.round(fps * 1),   // 1秒淡入
      fadeOut: Math.round(fps * 2),  // 2秒淡出
    })
  }

  const durationLabel = (ms: number) => {
    const s = Math.round(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 搜索栏 */}
      <div style={{ padding: '10px 12px 0', flexShrink: 0 }}>
        <input
          type="text"
          placeholder={t('editor.bgm.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 10px',
            fontSize: '12px',
            borderRadius: '6px',
            border: '1px solid var(--glass-stroke-base)',
            background: 'var(--glass-bg-muted)',
            color: 'var(--glass-text-primary)',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Genre 筛选 */}
      <div style={{ padding: '8px 12px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {GENRES.map((g) => (
            <button
              key={g || 'all'}
              onClick={() => setGenre(g)}
              style={{
                padding: '2px 7px',
                fontSize: '11px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                background: genre === g
                  ? 'var(--glass-accent-from)'
                  : 'var(--glass-bg-muted)',
                color: genre === g
                  ? 'var(--glass-text-on-accent)'
                  : 'var(--glass-text-secondary)',
              }}
            >
              {g ? t(`editor.bgm.genre.${g}`) : t('editor.bgm.genreAll')}
            </button>
          ))}
        </div>
      </div>

      {/* Mood 筛选 */}
      <div style={{ padding: '6px 12px 8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {MOODS.map((m) => (
            <button
              key={m || 'all'}
              onClick={() => setMood(m)}
              style={{
                padding: '2px 7px',
                fontSize: '11px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                background: mood === m
                  ? 'color-mix(in srgb, var(--glass-accent-to) 80%, transparent)'
                  : 'var(--glass-bg-muted)',
                color: mood === m
                  ? 'var(--glass-text-on-accent)'
                  : 'var(--glass-text-secondary)',
              }}
            >
              {m ? t(`editor.bgm.mood.${m}`) : t('editor.bgm.moodAll')}
            </button>
          ))}
        </div>
      </div>

      {/* 曲目列表 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 8px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}>
        {loading ? (
          <p style={{ fontSize: '12px', color: 'var(--glass-text-tertiary)', textAlign: 'center', padding: '20px 0' }}>
            {t('editor.bgm.loading')}
          </p>
        ) : tracks.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--glass-text-tertiary)', textAlign: 'center', padding: '20px 0' }}>
            {t('editor.bgm.empty')}
          </p>
        ) : (
          tracks.map((track) => {
            const isPlaying = playingId === track.id
            const isUsed = usedBgmIds.has(track.id)
            return (
              <div
                key={track.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: isUsed ? 'var(--glass-tone-success-bg)' : 'var(--glass-bg-surface)',
                  border: `1px solid ${isUsed ? 'var(--glass-tone-success-border)' : 'var(--glass-stroke-base)'}`,
                }}
              >
                {/* 播放按钮 */}
                <button
                  onClick={() => handlePlay(track)}
                  disabled={!track.playUrl}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    border: 'none',
                    background: isPlaying ? 'var(--glass-accent-from)' : 'var(--glass-bg-muted)',
                    color: isPlaying ? 'white' : 'var(--glass-text-secondary)',
                    cursor: track.playUrl ? 'pointer' : 'not-allowed',
                    fontSize: '12px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>

                {/* 曲目信息 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0,
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--glass-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {track.title}
                  </p>
                  <p style={{
                    margin: 0,
                    fontSize: '10px',
                    color: 'var(--glass-text-tertiary)',
                  }}>
                    {track.artist && `${track.artist} · `}{durationLabel(track.durationMs)}
                  </p>
                </div>

                {/* genre/mood 标签 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '9px',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    background: 'var(--glass-bg-muted)',
                    color: 'var(--glass-text-secondary)',
                  }}>
                    {track.genre}
                  </span>
                </div>

                {/* 添加按钮 */}
                <button
                  onClick={() => handleAdd(track)}
                  disabled={!track.playUrl}
                  style={{
                    flexShrink: 0,
                    padding: '3px 8px',
                    fontSize: '11px',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: track.playUrl ? 'pointer' : 'not-allowed',
                    background: 'var(--glass-accent-from)',
                    color: 'var(--glass-text-on-accent)',
                    opacity: track.playUrl ? 1 : 0.4,
                  }}
                >
                  {isUsed ? '✓' : '+'}
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
