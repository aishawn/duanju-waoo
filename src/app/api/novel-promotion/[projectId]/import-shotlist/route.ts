import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { readFiniteNumber } from '@/lib/novel-promotion/shotlist-import/parse-shotlist'

const MAX_SHOTS = 120

type ShotInput = {
  durationSec: number
  narration: string
  description?: string | null
  subtitle?: string | null
  shotType?: string | null
  srtStart?: number | null
  srtEnd?: number | null
}

function parseShotInput(raw: unknown, index: number): ShotInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError('INVALID_PARAMS', { message: `shots[${index}] 无效` })
  }
  const row = raw as Record<string, unknown>
  const narration =
    typeof row.narration === 'string'
      ? row.narration.trim()
      : typeof row.content === 'string'
        ? row.content.trim()
        : ''
  if (!narration) {
    throw new ApiError('INVALID_PARAMS', { message: `shots[${index}] 缺少口播内容` })
  }

  const durationSecRaw =
    readFiniteNumber(row.durationSec) ?? readFiniteNumber(row.duration)
  if (durationSecRaw === null || durationSecRaw <= 0 || durationSecRaw > 3600) {
    throw new ApiError('INVALID_PARAMS', { message: `shots[${index}] 缺少或无效 durationSec` })
  }
  const durationSec = durationSecRaw

  const description =
    typeof row.description === 'string' ? row.description.trim() || null : null
  const subtitle =
    typeof row.subtitle === 'string'
      ? row.subtitle.trim() || null
      : typeof row.screenSubtitle === 'string'
        ? row.screenSubtitle.trim() || null
        : null
  const shotType =
    typeof row.shotType === 'string' ? row.shotType.trim() || null : null
  let srtStart = readFiniteNumber(row.srtStart)
  let srtEnd = readFiniteNumber(row.srtEnd)
  if (srtStart !== null && srtEnd !== null && srtEnd < srtStart) {
    const t = srtStart
    srtStart = srtEnd
    srtEnd = t
  }

  return {
    durationSec,
    narration,
    description,
    subtitle,
    shotType,
    srtStart: srtStart ?? null,
    srtEnd: srtEnd ?? null,
  }
}

/**
 * POST /api/novel-promotion/[projectId]/import-shotlist
 * 批量追加镜头与绑定台词（不走 script-to-storyboard）
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    throw new ApiError('INVALID_PARAMS')
  }

  const episodeId = typeof body.episodeId === 'string' ? body.episodeId.trim() : ''
  const storyboardId = typeof body.storyboardId === 'string' ? body.storyboardId.trim() : ''
  const speaker = typeof body.speaker === 'string' ? body.speaker.trim() : ''
  const novelText =
    typeof body.novelText === 'string' && body.novelText.trim() ? body.novelText.trim() : null

  if (!episodeId || !storyboardId) {
    throw new ApiError('INVALID_PARAMS', { message: '需要 episodeId 与 storyboardId' })
  }
  if (!speaker) {
    throw new ApiError('INVALID_PARAMS', { message: '需要 speaker（发言人）' })
  }

  const shotsRaw = body.shots
  if (!Array.isArray(shotsRaw) || shotsRaw.length === 0) {
    throw new ApiError('INVALID_PARAMS', { message: 'shots 须为非空数组' })
  }
  if (shotsRaw.length > MAX_SHOTS) {
    throw new ApiError('INVALID_PARAMS', { message: `单次最多导入 ${MAX_SHOTS} 条镜头` })
  }

  const shots: ShotInput[] = shotsRaw.map((item, i) => parseShotInput(item, i))

  const novelPromotionProject = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: { id: true },
  })
  if (!novelPromotionProject) {
    throw new ApiError('NOT_FOUND')
  }

  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: {
      id: episodeId,
      novelPromotionProjectId: novelPromotionProject.id,
    },
    select: { id: true },
  })
  if (!episode) {
    throw new ApiError('NOT_FOUND')
  }

  const storyboard = await prisma.novelPromotionStoryboard.findFirst({
    where: {
      id: storyboardId,
      episodeId,
    },
    select: { id: true },
  })
  if (!storyboard) {
    throw new ApiError('NOT_FOUND', { message: '分镜组不存在或不属于该剧集' })
  }

  const result = await prisma.$transaction(async (tx) => {
    if (novelText) {
      await tx.novelPromotionEpisode.update({
        where: { id: episodeId },
        data: { novelText },
      })
    }

    const maxPanel = await tx.novelPromotionPanel.findFirst({
      where: { storyboardId },
      orderBy: { panelIndex: 'desc' },
      select: { panelIndex: true },
    })
    let nextPanelIndex = maxPanel ? maxPanel.panelIndex + 1 : 0

    const createdPanels: { id: string; panelIndex: number }[] = []

    for (const shot of shots) {
      const panel = await tx.novelPromotionPanel.create({
        data: {
          storyboardId,
          panelIndex: nextPanelIndex,
          panelNumber: nextPanelIndex + 1,
          shotType: shot.shotType ?? null,
          description: shot.description ?? null,
          videoPrompt: shot.description ?? null,
          srtSegment: shot.subtitle ?? null,
          srtStart: shot.srtStart ?? null,
          srtEnd: shot.srtEnd ?? null,
          duration: shot.durationSec,
        },
        select: { id: true, panelIndex: true },
      })
      createdPanels.push(panel)
      nextPanelIndex += 1
    }

    const panelCount = await tx.novelPromotionPanel.count({
      where: { storyboardId },
    })
    await tx.novelPromotionStoryboard.update({
      where: { id: storyboardId },
      data: { panelCount },
    })

    const maxLine = await tx.novelPromotionVoiceLine.findFirst({
      where: { episodeId },
      orderBy: { lineIndex: 'desc' },
      select: { lineIndex: true },
    })
    let lineIndex = (maxLine?.lineIndex ?? 0) + 1

    for (let i = 0; i < createdPanels.length; i++) {
      const panel = createdPanels[i]
      const shot = shots[i]
      await tx.novelPromotionVoiceLine.create({
        data: {
          episodeId,
          lineIndex: lineIndex,
          speaker,
          content: shot.narration,
          matchedPanelId: panel.id,
          matchedStoryboardId: storyboardId,
          matchedPanelIndex: panel.panelIndex,
        },
      })
      lineIndex += 1
    }

    return {
      panelsCreated: createdPanels.length,
      voiceLinesCreated: createdPanels.length,
      novelTextUpdated: Boolean(novelText),
    }
  })

  return NextResponse.json({ success: true, ...result })
})
