'use client'

/**
 * 剪辑编辑器 - 素材库面板
 *
 * 展示从分镜阶段已生成的视频片段，支持点击添加到时间轴。
 * 每个素材卡片显示：缩略图（video poster）、时长、分镜描述。
 */

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { VideoClip } from '../types/editor.types'

export interface MediaAsset {
  /** 素材唯一ID（来自 panelId） */
  id: string
  /** 视频URL */
  src: string
  /** 默认时长（帧数，30fps） */
  durationInFrames: number
  /** 对应分镜描述 */
  description?: string
  /** 所属分镜ID */
  storyboardId: string
  /** 面板索引 */
  panelIndex: number
  /** 缩略图 URL（可选，fallback 到 video 元素） */
  thumbnailUrl?: string
}

interface MediaLibraryPanelProps {
  assets: MediaAsset[]
  /** 已在时间轴中的 panelId 集合（用于标记已添加状态） */
  usedPanelIds: Set<string>
  onAddClip: (clip: Omit<VideoClip, 'id'>) => void
}

export function MediaLibraryPanel({ assets, usedPanelIds, onAddClip }: MediaLibraryPanelProps) {
  const t = useTranslations('video')
  const [filter, setFilter] = useState<'all' | 'unused'>('all')

  const filteredAssets = filter === 'unused'
    ? assets.filter((a) => !usedPanelIds.has(a.id))
    : assets

  const handleAddAsset = (asset: MediaAsset) => {
    onAddClip({
      src: asset.src,
      durationInFrames: asset.durationInFrames,
      metadata: {
        panelId: asset.id,
        storyboardId: asset.storyboardId,
        description: asset.description,
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 面板标题 */}
      <div style={{
        padding: '10px 12px 8px',
        borderBottom: '1px solid var(--glass-stroke-base)',
        flexShrink: 0,
      }}>
        <h3 style={{
          margin: '0 0 8px 0',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--glass-text-primary)',
        }}>
          {t('editor.left.title')}
        </h3>

        {/* 筛选器 */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['all', 'unused'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                background: filter === f
                  ? 'var(--glass-accent-from)'
                  : 'var(--glass-bg-muted)',
                color: filter === f
                  ? 'var(--glass-text-on-accent)'
                  : 'var(--glass-text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              {f === 'all'
                ? t('editor.left.filterAll')
                : t('editor.left.filterUnused')}
            </button>
          ))}
        </div>
      </div>

      {/* 素材列表 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>
        {filteredAssets.length === 0 ? (
          <p style={{
            fontSize: '12px',
            color: 'var(--glass-text-tertiary)',
            textAlign: 'center',
            padding: '20px 0',
          }}>
            {assets.length === 0
              ? t('editor.left.noAssets')
              : t('editor.left.allAdded')}
          </p>
        ) : (
          filteredAssets.map((asset) => {
            const isUsed = usedPanelIds.has(asset.id)
            return (
              <MediaAssetCard
                key={asset.id}
                asset={asset}
                isUsed={isUsed}
                onAdd={() => handleAddAsset(asset)}
                t={t}
              />
            )
          })
        )}
      </div>

      {/* 素材计数 */}
      <div style={{
        padding: '6px 12px',
        borderTop: '1px solid var(--glass-stroke-base)',
        fontSize: '11px',
        color: 'var(--glass-text-tertiary)',
        flexShrink: 0,
      }}>
        {t('editor.left.assetCount', {
          shown: filteredAssets.length,
          total: assets.length,
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 单个素材卡片
// ─────────────────────────────────────────

interface MediaAssetCardProps {
  asset: MediaAsset
  isUsed: boolean
  onAdd: () => void
  t: ReturnType<typeof useTranslations<'video'>>
}

function MediaAssetCard({ asset, isUsed, onAdd, t }: MediaAssetCardProps) {
  const durationSec = (asset.durationInFrames / 30).toFixed(1)

  return (
    <div
      style={{
        borderRadius: '6px',
        border: `1px solid ${isUsed ? 'var(--glass-tone-success-border)' : 'var(--glass-stroke-base)'}`,
        background: isUsed ? 'var(--glass-tone-success-bg)' : 'var(--glass-bg-surface)',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
    >
      {/* 视频缩略图区 */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        background: '#000',
        overflow: 'hidden',
      }}>
        <video
          src={asset.src}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          preload="metadata"
          muted
          playsInline
        />
        {/* 时长标签 */}
        <span style={{
          position: 'absolute',
          bottom: '4px',
          right: '4px',
          background: 'rgba(0,0,0,0.7)',
          color: '#fff',
          fontSize: '10px',
          padding: '1px 4px',
          borderRadius: '3px',
        }}>
          {durationSec}s
        </span>
        {/* 已添加标记 */}
        {isUsed && (
          <span style={{
            position: 'absolute',
            top: '4px',
            left: '4px',
            background: 'var(--glass-tone-success-fg)',
            color: '#fff',
            fontSize: '9px',
            padding: '1px 5px',
            borderRadius: '3px',
            fontWeight: 600,
          }}>
            ✓ {t('editor.left.added')}
          </span>
        )}
      </div>

      {/* 描述 + 操作 */}
      <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <p style={{
          flex: 1,
          margin: 0,
          fontSize: '11px',
          color: 'var(--glass-text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {asset.description || `${t('editor.left.clipLabel')} ${asset.panelIndex + 1}`}
        </p>
        <button
          onClick={onAdd}
          style={{
            flexShrink: 0,
            padding: '2px 8px',
            fontSize: '11px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            background: 'var(--glass-accent-from)',
            color: 'var(--glass-text-on-accent)',
          }}
          title={t('editor.left.addToTimeline')}
        >
          +
        </button>
      </div>
    </div>
  )
}
