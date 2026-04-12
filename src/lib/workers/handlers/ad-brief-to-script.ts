/**
 * 广告Brief → 广告脚本 Worker Handler
 *
 * 流程：
 * 1. 读取 adBriefData（JSON）
 * 2. 调用 AI 生成广告脚本（JSON结构）
 * 3. 将脚本写入 novelPromotionEpisode.novelText
 * 4. 将脚本JSON写回 NovelPromotionProject.adBriefData 的 generatedScript 字段（缓存）
 */

import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { logAIAnalysis } from '@/lib/logging/semantic'
import { reportTaskProgress } from '@/lib/workers/shared'
import { PROMPT_IDS, buildPrompt } from '@/lib/prompt-i18n'
import { resolveAnalysisModel } from './resolve-analysis-model'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import type { AdBrief } from '@/types/project'
import { getArtStylePrompt } from '@/lib/constants'
import { parseEffort, parseTemperature } from './story-to-script-helpers'

function isReasoningEffort(value: unknown): value is 'minimal' | 'low' | 'medium' | 'high' {
  return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high'
}

type AnyObj = Record<string, unknown>

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * 将 AdEmotionTone 转为中文描述
 */
function emotionToneToZh(tone: string): string {
  const map: Record<string, string> = {
    energetic: '高能运动，充满激情与力量感',
    warm: '温情暖色，情感共鸣，生活化',
    tech: '科技冷静，理性精准，未来感',
    elegant: '高端优雅，品味非凡，奢华质感',
    joyful: '欢乐轻松，活泼亲切，积极向上',
    inspiring: '励志感动，突破自我，正能量',
  }
  return map[tone] ?? tone
}

/**
 * 将 AdType 转为中文描述
 */
function adTypeToZh(type: string): string {
  const map: Record<string, string> = {
    tvc: '品牌TVC（电视广告）',
    social_media: '社交媒体广告',
    product_demo: '产品演示广告',
    brand_story: '品牌故事片',
  }
  return map[type] ?? type
}

/**
 * 解析 Brief JSON，提供默认值
 */
function parseBrief(raw: string | null | undefined): AdBrief | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as AdBrief
  } catch {
    return null
  }
}

/**
 * 从 AI 输出中提取 JSON 块
 */
function extractJsonFromOutput(text: string): string {
  // 先找 ```json ... ``` 块
  const mdMatch = text.match(/```json\s*([\s\S]*?)```/)
  if (mdMatch) return mdMatch[1].trim()

  // 找第一个完整 JSON 对象
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)

  return text
}

export async function handleAdBriefToScriptTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const episodeId = asString(payload.episodeId || job.data.episodeId || '')
  const inputModel = asString(payload.model).trim()
  const reasoning = payload.reasoning !== false
  const requestedReasoningEffort = parseEffort(payload.reasoningEffort)
  const temperature = parseTemperature(payload.temperature)

  if (!episodeId) {
    throw new Error('episodeId is required for ad_brief_to_script task')
  }

  // 1. 获取项目和Brief数据
  await reportTaskProgress(job, 5, { stage: 'load_brief' })

  const novelData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
  })
  if (!novelData) throw new Error('Novel promotion data not found')

  const brief = parseBrief(novelData.adBriefData)
  if (!brief) throw new Error('adBriefData is empty or invalid. Please save the Brief first.')

  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
    select: { id: true, name: true },
  })
  if (!episode) throw new Error(`Episode not found: ${episodeId}`)

  // 2. 解析模型
  const model = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel: inputModel || undefined,
    projectAnalysisModel: novelData.analysisModel,
  })

  const llmCapabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
    projectId,
    userId: job.data.userId,
    modelType: 'llm',
    modelKey: model,
  })
  const reasoningEffort = requestedReasoningEffort
    || (isReasoningEffort(llmCapabilityOptions.reasoningEffort) ? llmCapabilityOptions.reasoningEffort : 'high')

  await reportTaskProgress(job, 15, { stage: 'prepare_prompt' })

  // 3. 构建 Prompt 变量
  const artStylePrompt = getArtStylePrompt(novelData.artStyle, job.data.locale)
  const keySellingPointsStr = (brief.keySellingPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n')
  const referenceStyleLine = brief.referenceStyle ? `参考风格：${brief.referenceStyle}` : ''
  const sloganLine = brief.slogan ? `品牌口号：${brief.slogan}` : ''

  const promptText = buildPrompt({
    promptId: PROMPT_IDS.AD_BRIEF_TO_SCRIPT,
    locale: job.data.locale,
    variables: {
      brand_name: brief.brandName,
      product_name: brief.productName,
      key_selling_points: keySellingPointsStr,
      target_audience: brief.targetAudience,
      emotion_tone: emotionToneToZh(brief.emotionTone),
      duration_sec: String(brief.durationSec || novelData.adDurationSec || 30),
      ad_type: adTypeToZh(brief.adType),
      art_style: artStylePrompt || novelData.artStyle,
      reference_style: referenceStyleLine,
      slogan: sloganLine,
    },
  })

  await reportTaskProgress(job, 25, { stage: 'generating_script' })

  // 4. 调用 AI 生成脚本
  const streamContext = createWorkerLLMStreamContext(job, 'ad_brief_to_script')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)

  let outputText = ''

  await withInternalLLMStreamCallbacks(streamCallbacks, async () => {
    const result = await executeAiTextStep({
      userId: job.data.userId,
      model,
      messages: [
        { role: 'system', content: promptText },
        {
          role: 'user',
          content: `请根据以上Brief生成${brief.durationSec || 30}秒广告脚本，严格输出JSON格式。`,
        },
      ],
      projectId,
      action: 'ad_brief_to_script',
      meta: {
        stepId: 'ad_brief_to_script',
        stepTitle: 'Brief → 广告脚本',
        stepIndex: 1,
        stepTotal: 1,
      },
      temperature,
      reasoning,
      reasoningEffort,
    })
    outputText = result.text
  })
  await streamCallbacks.flush()

  await reportTaskProgress(job, 75, { stage: 'parse_script' })

  // 5. 解析 JSON 输出
  const jsonStr = extractJsonFromOutput(outputText)
  let scriptJson: AnyObj
  try {
    scriptJson = JSON.parse(jsonStr) as AnyObj
  } catch {
    throw new Error(`AI返回的脚本JSON解析失败: ${jsonStr.slice(0, 200)}`)
  }

  logAIAnalysis('ad_brief_to_script', {
    projectId,
    episodeId,
    briefBrandName: brief.brandName,
    model,
    shotCount: Array.isArray(scriptJson.shots) ? (scriptJson.shots as unknown[]).length : 0,
  })

  await reportTaskProgress(job, 85, { stage: 'persist_script' })

  // 6. 持久化：将脚本写入 episode.novelText，供后续 story-to-script 阶段使用
  // 同时将结构化脚本写入 adBriefData（合并存储，避免增加字段）
  const updatedBriefData = {
    ...brief,
    _generatedScript: scriptJson,  // 下划线前缀标识系统生成数据
    _scriptGeneratedAt: new Date().toISOString(),
  }

  // novelText 存储人类可读的广告脚本（用于分镜阶段的输入）
  const novelTextFromScript = formatScriptAsText(scriptJson)

  await prisma.$transaction([
    prisma.novelPromotionEpisode.update({
      where: { id: episodeId },
      data: {
        novelText: novelTextFromScript,
        description: String(scriptJson.logline || ''),
      },
    }),
    prisma.novelPromotionProject.update({
      where: { projectId },
      data: {
        adBriefData: JSON.stringify(updatedBriefData),
        // 将脚本时长同步到项目
        adDurationSec: brief.durationSec || novelData.adDurationSec,
      },
    }),
  ])

  await reportTaskProgress(job, 95, { stage: 'done' })

  return {
    episodeId,
    scriptTitle: String(scriptJson.title || ''),
    shotCount: Array.isArray(scriptJson.shots) ? (scriptJson.shots as unknown[]).length : 0,
    scriptJson,
  }
}

/**
 * 将结构化脚本JSON转换为人类可读文本（供分镜AI解析）
 */
function formatScriptAsText(scriptJson: AnyObj): string {
  const lines: string[] = []

  if (scriptJson.title) lines.push(`# ${scriptJson.title}`)
  if (scriptJson.logline) lines.push(`\n创意概念：${scriptJson.logline}`)
  if (scriptJson.key_visual_concept) lines.push(`视觉概念：${scriptJson.key_visual_concept}`)
  if (scriptJson.brand_slogan) lines.push(`品牌口号：${scriptJson.brand_slogan}`)

  if (scriptJson.voiceover_script) {
    lines.push(`\n## 完整旁白\n${scriptJson.voiceover_script}`)
  }

  const shots = Array.isArray(scriptJson.shots) ? scriptJson.shots as AnyObj[] : []
  if (shots.length > 0) {
    lines.push(`\n## 分镜脚本（共${shots.length}个镜头）\n`)
    for (const shot of shots) {
      lines.push(
        `### 镜头${shot.shot_number} [${shot.shot_type} / ${shot.camera_move}] ${shot.duration_sec}秒`,
      )
      lines.push(`画面：${shot.visual_description}`)
      if (shot.voiceover) lines.push(`旁白：${shot.voiceover}`)
      if (shot.emotion) lines.push(`情绪：${shot.emotion}`)
      lines.push(`叙事阶段：${shot.narrative_stage}`)
      lines.push('')
    }
  }

  return lines.join('\n')
}
