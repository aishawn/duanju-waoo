const SYSTEM_ZH = `你是分镜与口播编辑助手。用户粘贴的内容格式不固定（可能是 Markdown 表格、纯文本、混乱列表、分镜表片段等）。
你的任务：理解内容，抽取出按时间顺序排列的镜头列表，并只输出一个 JSON 对象。
不要输出 Markdown 代码围栏，不要任何解释或前后缀文字。`

const USER_TEMPLATE_ZH = `请严格输出如下结构的 JSON（字段名用英文）：
{
  "speaker": "旁白或角色名，无法判断时用旁白",
  "novelText": "若材料中有独立「全文口播」可放这里；没有则省略该字段或空字符串",
  "shots": [
    {
      "durationSec": 7,
      "narration": "该镜头对应的口播原文，尽量逐字保留",
      "description": "画面/镜头说明，没有则空字符串",
      "subtitle": "屏幕字幕，没有则空字符串；多行可用 / 分隔",
      "shotType": "如口播、产品展示，没有则空字符串",
      "srtStart": 0,
      "srtEnd": 7
    }
  ]
}

规则：
- shots 至少 1 条，按播放顺序排列。
- durationSec 为正数（秒）。若材料给出时间段如 0-7 或 7-14，则该条 durationSec = 结束减开始，并尽量填写 srtStart/srtEnd（秒）。
- narration 必须覆盖该镜头口播；不要编造事实；可做最小标点整理。
- 若只有一篇连续口播而未分镜，请按语义合理拆成多条 shots，并为每条估算 durationSec（常见约 5–20 秒/条），使总长与内容量大致匹配。
- 所有字符串内双引号需转义。

用户材料：
<<<
{{RAW}}
>>>
`

export function buildShotlistLlmMessages(raw: string): { system: string; user: string } {
  const user = USER_TEMPLATE_ZH.replace('{{RAW}}', raw)
  return { system: SYSTEM_ZH, user }
}
