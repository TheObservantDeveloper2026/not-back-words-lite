/**
 * 记忆调度引擎
 *
 * 基于 SM-2（SuperMemo 2）改进：每个单词维护 ease（难度系数）与 interval（下次复习间隔），
 * 答对拉长间隔，答错回退到初始状态重新记忆。相比纯艾宾浩斯固定间隔，
 * SM-2 能根据个人遗忘曲线动态调整，对"总是记不住的词"会安排更密集的复习。
 */

/** 单个单词的学习状态 */
export interface WordProgress {
  /** 单词 id */
  id: string
  /** 所属词书 */
  book: string
  /** 难度系数 ease factor，范围 1.3 - 3.0 */
  ease: number
  /** 当前复习间隔（天） */
  interval: number
  /** 连续答对次数 */
  streak: number
  /** 下次复习时间戳（ms） */
  due: number
  /** 首次学习时间 */
  learnedAt: number
  /** 最近一次复习时间 */
  lastReview: number
  /** 总复习次数 */
  reviews: number
  /** 累计错误次数 */
  mistakes: number
  /** 学习状态 */
  status: WordStatus
}

/** 学习状态机 */
export type WordStatus =
  | 'new' // 未学习
  | 'learning' // 学习中（还没通过一次）
  | 'reviewing' // 复习中
  | 'mastered' // 已掌握

/** 答题结果 */
export type AnswerResult = 'again' | 'hard' | 'good' | 'easy'

/** 掌握等级划分 */
export const MASTER_INTERVAL = 21 // 间隔超过 21 天视为已掌握

const MIN_EASE = 1.3
const MAX_EASE = 3.0
const EASE_STEP = 0.1

/** 新词初始状态 */
export function createProgress(id: string, book: string): WordProgress {
  return {
    id,
    book,
    ease: 2.5,
    interval: 0,
    streak: 0,
    due: Date.now(),
    learnedAt: 0,
    lastReview: 0,
    reviews: 0,
    mistakes: 0,
    status: 'new',
  }
}

/**
 * 根据答题结果推进复习计划
 */
export function applyReview(progress: WordProgress, result: AnswerResult): WordProgress {
  const now = Date.now()
  const next: WordProgress = { ...progress }

  next.reviews += 1
  next.lastReview = now
  if (next.learnedAt === 0) next.learnedAt = now

  switch (result) {
    case 'again': {
      // 完全忘记：重置间隔，难度系数下调
      next.mistakes += 1
      next.streak = 0
      next.interval = 0
      next.ease = clampEase(next.ease - 0.25)
      next.due = now + 5 * 60 * 1000 // 5 分钟后再看
      next.status = 'learning'
      break
    }
    case 'hard': {
      // 想起来但吃力：间隔缓慢增长
      next.streak += 1
      next.ease = clampEase(next.ease - 0.05)
      next.interval = next.interval === 0 ? 1 : next.interval * 1.2
      next.status = next.interval >= 1 ? 'reviewing' : 'learning'
      next.due = now + next.interval * DAY
      break
    }
    case 'good': {
      // 正常回答：按 ease 增长间隔
      next.streak += 1
      next.interval = nextReviewInterval(next)
      next.status = next.interval >= MASTER_INTERVAL ? 'mastered' : 'reviewing'
      next.due = now + next.interval * DAY
      break
    }
    case 'easy': {
      // 秒答：间隔增长更快
      next.streak += 1
      next.ease = clampEase(next.ease + EASE_STEP)
      next.interval = next.interval === 0 ? 2 : next.interval * next.ease * 1.15
      next.status = next.interval >= MASTER_INTERVAL ? 'mastered' : 'reviewing'
      next.due = now + next.interval * DAY
      break
    }
  }

  return next
}

const DAY = 24 * 60 * 60 * 1000

/**
 * SM-2 间隔递推
 * 第一次答对 → 1 天，第二次 → 6 天，之后 interval * ease
 */
function nextReviewInterval(p: WordProgress): number {
  if (p.interval <= 0) return 1
  if (p.interval === 1) return 6
  return Math.round(p.interval * p.ease)
}

function clampEase(v: number): number {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(v * 100) / 100))
}

/** 是否到期需要复习 */
export function isDue(p: WordProgress, now = Date.now()): boolean {
  return p.status !== 'new' && p.due <= now
}

/**
 * 掌握度 0-1，用于进度条与统计
 * 基于连续答对次数与 ease
 */
export function masteryLevel(p: WordProgress): number {
  if (p.status === 'new') return 0
  if (p.status === 'mastered') return 1
  const byInterval = Math.min(p.interval / MASTER_INTERVAL, 1)
  const byStreak = Math.min(p.streak / 5, 1)
  const byEase = (p.ease - MIN_EASE) / (MAX_EASE - MIN_EASE)
  return clamp01(byInterval * 0.5 + byStreak * 0.35 + byEase * 0.15)
}

/**
 * 生成今日学习队列
 * 混合「新词」与「到期复习词」，优先复习已到期的词
 */
export function buildQueue(
  progressList: Map<string, WordProgress>,
  wordIds: string[],
  newLimit: number,
  reviewLimit: number,
  now = Date.now(),
): { newWords: string[]; reviewWords: string[] } {
  const newWords: string[] = []
  const reviewWords: WordProgress[] = []

  for (const id of wordIds) {
    const p = progressList.get(id)
    if (!p || p.status === 'new') {
      newWords.push(id)
    } else if (p.due <= now) {
      reviewWords.push(p)
    }
  }

  // 到期复习：按到期时间先后排序，越久没复习的越优先
  reviewWords.sort((a, b) => a.due - b.due)

  return {
    newWords: newWords.slice(0, newLimit),
    reviewWords: reviewWords.slice(0, reviewLimit).map((p) => p.id),
  }
}

/** 统计一份词书的整体进度 */
export interface BookStats {
  total: number
  new: number
  learning: number
  reviewing: number
  mastered: number
  /** 平均掌握度 0-1 */
  mastery: number
}

export function computeBookStats(wordIds: string[], progressList: Map<string, WordProgress>): BookStats {
  const stats: BookStats = {
    total: wordIds.length,
    new: 0,
    learning: 0,
    reviewing: 0,
    mastered: 0,
    mastery: 0,
  }
  if (wordIds.length === 0) return stats

  let masterySum = 0
  for (const id of wordIds) {
    const p = progressList.get(id)
    if (!p || p.status === 'new') {
      stats.new += 1
    } else {
      stats[p.status] += 1
      masterySum += masteryLevel(p)
    }
  }
  stats.mastery = masterySum / wordIds.length
  return stats
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}