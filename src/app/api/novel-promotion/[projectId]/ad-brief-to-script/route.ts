import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'
import type { AdBrief } from '@/types/project'

/**
 * POST /api/novel-promotion/[projectId]/ad-brief-to-script
 *
 * 保存广告Brief并触发AI脚本生成任务
 *
 * Body:
 *   episodeId: string       — 目标剧集ID（脚本将写入此剧集的 novelText）
 *   brief: AdBrief          — 广告Brief数据
 *   model?: string          — 指定分析模型（可选）
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const body = await request.json().catch(() => ({}))
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId.trim() : ''
  const brief = body?.brief as AdBrief | undefined

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS', 'episodeId is required')
  }
  if (!brief || !brief.brandName || !brief.productName) {
    throw new ApiError('INVALID_PARAMS', 'brief.brandName and brief.productName are required')
  }

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 先持久化 Brief 数据到数据库（即使任务失败，Brief也不会丢失）
  await prisma.novelPromotionProject.update({
    where: { projectId },
    data: {
      adBriefData: JSON.stringify(brief),
      adDurationSec: brief.durationSec ?? null,
      adType: brief.adType ?? null,
      workflowMode: 'ad_film',
    },
  })

  // 提交AI生成任务
  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    episodeId,
    type: TASK_TYPE.AD_BRIEF_TO_SCRIPT,
    targetType: 'NovelPromotionEpisode',
    targetId: episodeId,
    routePath: `/api/novel-promotion/${projectId}/ad-brief-to-script`,
    body: {
      ...body,
      displayMode: 'detail',
    },
    dedupeKey: `ad_brief_to_script:${episodeId}`,
    priority: 1,
  })

  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})

/**
 * GET /api/novel-promotion/[projectId]/ad-brief-to-script
 *
 * 获取当前项目的 Brief 数据和生成状态
 */
export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const novelData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: {
      adBriefData: true,
      adDurationSec: true,
      adType: true,
      workflowMode: true,
    },
  })

  if (!novelData) {
    throw new ApiError('NOT_FOUND')
  }

  let brief: AdBrief | null = null
  let generatedScript: unknown = null

  if (novelData.adBriefData) {
    try {
      const parsed = JSON.parse(novelData.adBriefData)
      generatedScript = parsed._generatedScript ?? null
      // 返回时去掉系统生成字段
      const { _generatedScript: _gs, _scriptGeneratedAt: _sa, ...briefOnly } = parsed
      void _gs; void _sa
      brief = briefOnly as AdBrief
    } catch {
      // ignore parse error
    }
  }

  return NextResponse.json({
    brief,
    adDurationSec: novelData.adDurationSec,
    adType: novelData.adType,
    workflowMode: novelData.workflowMode,
    hasGeneratedScript: !!generatedScript,
  })
})
