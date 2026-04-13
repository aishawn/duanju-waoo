/**
 * 将用户粘贴的 Markdown 表格或 JSON 解析为分镜导入结构（纯函数，无 IO）
 */

export interface ImportShotlistShotInput {
  durationSec: number
  narration: string
  description?: string | null
  subtitle?: string | null
  shotType?: string | null
  srtStart?: number | null
  srtEnd?: number | null
}

export interface ParsedShotlist {
  speaker: string
  novelText?: string
  shots: ImportShotlistShotInput[]
}

const DEFAULT_SPEAKER = '旁白'

function normalizeCell(s: string): string {
  return s.replace(/\r/g, '').trim()
}

/** 解析「0-7」「7-14」「62-78」或单独数字「7」 */
export function parseDurationCell(cell: string): {
  durationSec: number
  srtStart: number | null
  srtEnd: number | null
} {
  const raw = normalizeCell(cell)
  if (!raw) {
    throw new Error('时长单元格为空')
  }
  const range = raw.match(/^(\d+(?:\.\d+)?)\s*[-–~～]\s*(\d+(?:\.\d+)?)$/)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      throw new Error(`无效时长范围: ${raw}`)
    }
    const start = Math.min(a, b)
    const end = Math.max(a, b)
    const durationSec = Math.max(0.1, end - start)
    return { durationSec, srtStart: start, srtEnd: end }
  }
  const single = Number(raw)
  if (Number.isFinite(single) && single > 0) {
    return { durationSec: single, srtStart: null, srtEnd: null }
  }
  throw new Error(`无法解析时长: ${raw}`)
}

function splitTableLine(line: string): string[] {
  const t = line.trim()
  if (!t.includes('|')) return []
  return t
    .split('|')
    .map((c) => normalizeCell(c))
    .filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''))
}

function isSeparatorRow(cells: string[]): boolean {
  if (cells.length === 0) return true
  return cells.every((c) => /^[-:\s]+$/.test(c))
}

function findColumnIndex(headers: string[], keywords: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    if (keywords.some((k) => h.includes(k))) return i
  }
  return -1
}

/**
 * 从 Markdown 表格解析（表头需含：时长、口播；建议含：画面内容、屏幕字幕、画面类型）
 */
export function parseMarkdownShotTable(markdown: string): Omit<ParsedShotlist, 'novelText'> {
  const lines = markdown.split(/\r?\n/).map((l) => l.trimEnd())
  let headerCells: string[] | null = null
  let headerLineIndex = -1

  for (let i = 0; i < lines.length; i++) {
    const cells = splitTableLine(lines[i])
    if (cells.length >= 3) {
      headerCells = cells
      headerLineIndex = i
      break
    }
  }

  if (!headerCells || headerLineIndex < 0) {
    throw new Error('未找到 Markdown 表格表头（至少需要 3 列）')
  }

  const idxDuration = findColumnIndex(headerCells, ['时长'])
  const idxNarration = findColumnIndex(headerCells, ['口播'])
  const idxDesc = findColumnIndex(headerCells, ['画面内容'])
  const idxSubtitle = findColumnIndex(headerCells, ['屏幕字幕', '字幕'])
  const idxShotType = findColumnIndex(headerCells, ['画面类型', '类型'])

  if (idxDuration < 0) {
    throw new Error('表格缺少「时长」列（如 0-7 或 7-14）')
  }
  if (idxNarration < 0) {
    throw new Error('表格缺少「口播」列')
  }

  const shots: ImportShotlistShotInput[] = []

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const cells = splitTableLine(lines[i])
    if (cells.length < 2) continue
    if (isSeparatorRow(cells)) continue
    if (cells.length < headerCells.length && cells.every((c) => !c)) continue

    const durCell = cells[idxDuration] ?? ''
    const narration = normalizeCell(cells[idxNarration] ?? '')
    if (!narration) continue

    const { durationSec, srtStart, srtEnd } = parseDurationCell(durCell)
    const description =
      idxDesc >= 0 ? normalizeCell(cells[idxDesc] ?? '') || null : null
    const subtitle =
      idxSubtitle >= 0 ? normalizeCell(cells[idxSubtitle] ?? '') || null : null
    const shotType =
      idxShotType >= 0 ? normalizeCell(cells[idxShotType] ?? '') || null : null

    shots.push({
      durationSec,
      narration,
      description,
      subtitle,
      shotType,
      srtStart,
      srtEnd,
    })
  }

  if (shots.length === 0) {
    throw new Error('表格中没有有效数据行（需包含时长与口播）')
  }

  return { speaker: DEFAULT_SPEAKER, shots }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** 供导入 API 与规范化共用：兼容 JSON 数字字符串 */
export function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim().replace(/,/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

/** 校验并规范化已解析的 JSON 对象（含 LLM 输出，允许数字为字符串） */
export function normalizeShotlistFromUnknown(parsed: unknown): ParsedShotlist {
  const root = asRecord(parsed)
  if (!root) {
    throw new Error('JSON 根须为对象')
  }

  const shotsRaw = root.shots
  if (!Array.isArray(shotsRaw) || shotsRaw.length === 0) {
    throw new Error('JSON 缺少非空 shots 数组')
  }

  const speaker =
    typeof root.speaker === 'string' && root.speaker.trim()
      ? root.speaker.trim()
      : DEFAULT_SPEAKER

  const novelText =
    typeof root.novelText === 'string' && root.novelText.trim()
      ? root.novelText.trim()
      : undefined

  const shots: ImportShotlistShotInput[] = []

  for (let i = 0; i < shotsRaw.length; i++) {
    const row = asRecord(shotsRaw[i])
    if (!row) {
      throw new Error(`shots[${i}] 须为对象`)
    }
    const narration =
      typeof row.narration === 'string'
        ? row.narration.trim()
        : typeof row.content === 'string'
          ? row.content.trim()
          : ''
    if (!narration) {
      throw new Error(`shots[${i}] 缺少 narration 或 content`)
    }

    const durationRaw =
      readFiniteNumber(row.durationSec) ?? readFiniteNumber(row.duration)
    if (durationRaw === null || durationRaw <= 0) {
      throw new Error(`shots[${i}] 缺少有效 durationSec（秒）`)
    }
    if (durationRaw > 3600) {
      throw new Error(`shots[${i}] durationSec 过大`)
    }

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

    shots.push({
      durationSec: durationRaw,
      narration,
      description,
      subtitle,
      shotType,
      srtStart: srtStart ?? null,
      srtEnd: srtEnd ?? null,
    })
  }

  return { speaker, novelText, shots }
}

/** 解析顶层 JSON字符串：{ speaker?, novelText?, shots: [...] } */
export function parseShotlistJson(jsonText: string): ParsedShotlist {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText.trim())
  } catch {
    throw new Error('JSON 格式无效')
  }
  return normalizeShotlistFromUnknown(parsed)
}

/**
 * 自动：若以 { 开头则按 JSON，否则按 Markdown 表格
 */
export function parseShotlistPaste(text: string): ParsedShotlist {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('内容为空')
  }
  if (trimmed.startsWith('{')) {
    return parseShotlistJson(trimmed)
  }
  const md = parseMarkdownShotTable(trimmed)
  return { ...md }
}
