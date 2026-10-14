/**
 * 全局状态：应用 Store（轻量自研，无第三方状态库）
 */
import { useSyncExternalStore } from 'react'
import type { BookMeta } from '@/data/books'
import type { WordProgress } from '@/core/srs'
import { createProgress } from '@/core/srs'
import type { DailyStat, Settings } from '@/core/storage'
import {
  DEFAULT_SETTINGS,
  computeStreak,
  emptyStat,
  loadDailyStats,
  loadProgress,
  loadSettings,
  saveDailyStats,
  saveProgress,
  saveSettings,
  todayKey,
} from '@/core/storage'

export interface AppState {
  settings: Settings
  progress: Map<string, WordProgress>
  dailyStats: Record<string, DailyStat>
  streak: number
  /** 自定义词书 id 列表 */
  customBookIds: string[]
  ready: boolean
}

type Listener = () => void

const CUSTOM_IDX_KEY = 'bbdict.custom.index.v1'

let state: AppState = {
  settings: DEFAULT_SETTINGS,
  progress: new Map(),
  dailyStats: {},
  streak: 0,
  customBookIds: [],
  ready: false,
}

const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((l) => l())
}

function subscribe(l: Listener) {
  listeners.add(l)
  return () => listeners.delete(l)
}

function getSnapshot() {
  return state
}

/** 应用启动：读取持久化数据 */
export function initStore() {
  const settings = loadSettings()
  const progress = loadProgress()
  const dailyStats = loadDailyStats()
  const customBookIds = safeList(localStorage.getItem(CUSTOM_IDX_KEY))
  state = {
    settings,
    progress,
    dailyStats,
    streak: computeStreak(dailyStats),
    customBookIds,
    ready: true,
  }
  emit()
}

function safeList(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/* ---------------------------------- hooks --------------------------------- */

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  )
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/* --------------------------------- actions -------------------------------- */

export function updateSettings(patch: Partial<Settings>): void {
  state = { ...state, settings: { ...state.settings, ...patch } }
  saveSettings(state.settings)
  emit()
}

/** 更新自定义词书索引（存的是词书元信息） */
export function setCustomBooks(metas: BookMeta[]): void {
  const ids = metas.map((m) => m.id)
  state = { ...state, customBookIds: ids }
  localStorage.setItem(CUSTOM_IDX_KEY, JSON.stringify(ids))
  emit()
}

/** 记录一次答题，更新记忆进度与当日统计 */
export function recordAnswer(
  wordId: string,
  _book: string,
  next: WordProgress,
  correct: boolean,
  secondsSpent: number,
): void {
  const progress = new Map(state.progress)
  progress.set(wordId, next)
  state = { ...state, progress }

  const key = todayKey()
  const stats = { ...state.dailyStats }
  const today: DailyStat = { ...(stats[key] ?? emptyStat(key)) }

  today.answered += 1
  if (correct) today.correct += 1
  today.seconds += Math.round(secondsSpent)

  const prev = progress.get(wordId)
  // 首次学会一个新词
  if (prev?.status === 'new' || !prev) today.learned += 1
  else today.reviewed += 1

  stats[key] = today
  state = { ...state, dailyStats: stats, streak: computeStreak(stats) }

  saveProgress(progress)
  saveDailyStats(stats)
  emit()
}

/** 手动获取/创建进度 */
export function getProgress(wordId: string, book: string): WordProgress {
  return state.progress.get(wordId) ?? createProgress(wordId, book)
}

/** 重置某本书的全部进度 */
export function resetBook(wordIds: string[]): void {
  const progress = new Map(state.progress)
  wordIds.forEach((id) => progress.delete(id))
  state = { ...state, progress }
  saveProgress(progress)
  emit()
}

export function toggleStar(wordId: string): boolean {
  const STAR_KEY = 'bbdict.starred.v1'
  const list = safeList(localStorage.getItem(STAR_KEY))
  const idx = list.indexOf(wordId)
  let starred: boolean
  if (idx >= 0) {
    list.splice(idx, 1)
    starred = false
  } else {
    list.push(wordId)
    starred = true
  }
  localStorage.setItem(STAR_KEY, JSON.stringify(list))
  emit()
  return starred
}

export function getStarred(): string[] {
  return safeList(localStorage.getItem('bbdict.starred.v1'))
}