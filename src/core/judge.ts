/**
 * 判分逻辑（纯函数，便于单测）
 *
 * 抽出三个关注点：
 *  1. 选项题判定（英译汉）
 *  2. 输入题判定（汉译英 / 默写 / 听写）
 *  3. 正确率计算（必须恒在 0-100%���间，绝不允许 >100%）
 */

/** 判分结果 */
export interface JudgeResult {
  correct: boolean
  /** 统一的答案键：选项题用单词本身，输入题用归一化后的目标词 */
  answerKey: string
}

/** 答案归一化：忽略大小写、首尾空格、中英文标点、重复空格 */
export function normalizeAnswer(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}·，。、！？；：]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * 判定输入题（汉译英 / 默写 / 听写）
 * @param strict 听写模式要求完全一致（含空格）；默写允许忽略词间空格
 */
export function judgeInput(input: string, target: string, strict = false): JudgeResult {
  const a = normalizeAnswer(input)
  const b = normalizeAnswer(target)
  const answerKey = target

  // 空输入一律判错，不能因为空串等于空串而蒙对
  if (!a || !b) return { correct: false, answerKey }

  if (a === b) return { correct: true, answerKey }

  if (!strict && a.replace(/\s/g, '') === b.replace(/\s/g, '')) {
    return { correct: true, answerKey }
  }

  return { correct: false, answerKey }
}

/**
 * 判定选项题（英译汉）
 *
 * 必须同时校验「选项确实是干扰项之一」和「选项就是目标词」。
 * 只比单词即可—— buildChoices 保证四个选项互不相同。
 */
export function judgeChoice(
  chosenWord: string,
  targetWord: string,
  optionWords: string[],
): JudgeResult {
  const answerKey = targetWord
  const chosen = chosenWord.trim().toLowerCase()
  const target = targetWord.trim().toLowerCase()

  // 点击了不在选项里的词（越界/伪造），一律判错
  if (!optionWords.some((w) => w.trim().toLowerCase() === chosen)) {
    return { correct: false, answerKey }
  }

  return { correct: chosen === target, answerKey }
}

/**
 * 计算正确率（百分数）。
 *
 * 关键：分母是「实际作答次数」，不是「题目序号」。
 * 且结果强制夹在 0-100，任何计数异常都不会产出 >100% 的正确率。
 */
export function accuracyPercent(correctCount: number, answeredCount: number): number {
  if (!Number.isFinite(correctCount) || !Number.isFinite(answeredCount)) return 0
  if (answeredCount <= 0) return 0
  const pct = (Math.max(correctCount, 0) / answeredCount) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}