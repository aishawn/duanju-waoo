import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { getProjectModelConfig } from '@/lib/config-service'
import { safeParseJsonObject } from '@/lib/json-repair'
import { normalizeShotlistFromUnknown } from '@/lib/novel-promotion/shotlist-import/parse-shotlist'
import { buildShotlistLlmMessages } from '@/lib/novel-promotion/shotlist-import/shotlist-llm-prompt'

const MAX_RAW_CHARS = 60_000
const MAX_SHOTS = 120

/**
 * POST /api/novel-promotion/[projectId]/parse-shotlist-llm
 * 用 LLM 将任意格式的粘贴内容结构化为 import-shotlist 可用的 JSON（不落库）
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const body = await request.json().catch(() => null)

  const rawText = typeof body?.rawText === 'string' ? body.rawText.trim() : ''
  if (!rawText) {
    throw new ApiError('INVALID_PARAMS', { message: '需要 rawText' })
  }
  if (rawText.length > MAX_RAW_CHARS) {
    throw new ApiError('INVALID_PARAMS', {
      message: `内容过长，请控制在 ${MAX_RAW_CHARS} 字以内`,
    })
  }

  const authResult = await requireProjectAuth(projectId, {
    include: { characters: true, locations: true },
  })
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const modelConfig = await getProjectModelConfig(projectId, session.user.id)
  const analysisModel = typeof modelConfig.analysisModel === 'string'
    ? modelConfig.analysisModel.trim()
    : ''
  if (!analysisModel) {
    throw new ApiError('MISSING_CONFIG', { message: '请先在项目中配置分析模型' })
  }

  const { system, user } = buildShotlistLlmMessages(rawText)

  const completion = await executeAiTextStep({
    userId: session.user.id,
    model: analysisModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    projectId,
    action: 'shotlist_llm_parse',
    meta: {
      stepId: 'shotlist_llm_parse',
      stepTitle: '分镜结构化',
      stepIndex: 1,
      stepTotal: 1,
    },
  })

  let root: Record<string, unknown>
  try {
    root = safeParseJsonObject(completion.text)
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      message: '模型返回无法解析为 JSON，请简化材料后重试',
    })
  }

  let parsed: ReturnType<typeof normalizeShotlistFromUnknown>
  try {
    parsed = normalizeShotlistFromUnknown(root)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '结构化结果无效'
    throw new ApiError('INVALID_PARAMS', { message: msg })
  }

  if (parsed.shots.length > MAX_SHOTS) {
    throw new ApiError('INVALID_PARAMS', {
      message: `结构化镜头超过 ${MAX_SHOTS} 条，请拆分后重试`,
    })
  }

  return NextResponse.json({
    success: true,
    parsed,
  })
})
