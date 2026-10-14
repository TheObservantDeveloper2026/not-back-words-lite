/**
 * 本地持久化
 * - 学习进度 / 设置：localStorage（同步、轻量、足够小）
 * - 自定义词库：IndexedDB（可存上万条）
 */
import type { WordProgress } from './srs'
import type { Word, BookMeta } from '@/data/books'

const PROGRESS_KEY = 'bbdict.progress.v1'
const SETTINGS_KEY = 'bbdict.settings.v1'
const STATS_KEY = 'bbdict.dailystats.v1'
const DB_NAME = 'bbdict'
const DB_STORE = 'custom-books'

/** 用户设置 */
export interface Settings {
  /** 每日新词目标 */
  dailyNew: number
  /** 每日复习上限 */
  dailyReview: number
  /** 发音音色 */
  voice: string
  /** 发音速度 */
  rate: number
  /** 自动播放发音 */
  autoSpeak: boolean
  /** 主题 */
  theme: 'light' | 'dark'
  /** 当前词书 */
  currentBook: string
  /** 练习模式偏好顺序 */
  modeOrder: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  dailyNew: 20,
  dailyReview: 80,
  voice: '',
  rate: 0.9,
  autoSpeak: true,
  theme: 'light',
  currentBook: 'cet4',
  modeOrder: ['en2cn', 'cn2en', 'spell', 'listen'],
}

/** 每日学习统计 */
export interface DailyStat {
  /** YYYY-MM-DD */
  date: string
  /** 学习的新词数 */
  learned: number
  /** 完成的复习次数 */
  reviewed: number
  /** 答题总数 */
  answered: number
  /** 答对数 */
  correct: number
  /** 学习时长（秒） */
  seconds: number
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/* ---------------------------------- 进度 ---------------------------------- */

export function loadProgress(): Map<string, WordProgress> {
  const raw = safeParse<Record<string, WordProgress>>(localStorage.getItem(PROGRESS_KEY), {})
  return new Map(Object.entries(raw))
}

export function saveProgress(map: Map<string, WordProgress>): void {
  const obj: Record<string, WordProgress> = {}
  map.forEach((v, k) => {
    obj[k] = v
  })
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(obj))
}

/* ---------------------------------- 设置 ---------------------------------- */

export function loadSettings(): Settings {
  const raw = safeParse<Partial<Settings>>(localStorage.getItem(SETTINGS_KEY), {})
  return { ...DEFAULT_SETTINGS, ...raw }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

/* --------------------------------- 学习统计 -------------------------------- */

export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function loadDailyStats(): Record<string, DailyStat> {
  return safeParse<Record<string, DailyStat>>(localStorage.getItem(STATS_KEY), {})
}

export function saveDailyStats(stats: Record<string, DailyStat>): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats))
}

export function emptyStat(date = todayKey()): DailyStat {
  return { date, learned: 0, reviewed: 0, answered: 0, correct: 0, seconds: 0 }
}

/** 连续打卡天数（含今天或昨天为止的连续） */
export function computeStreak(stats: Record<string, DailyStat>): number {
  const keys = Object.keys(stats)
    .filter((k) => {
      const s = stats[k]
      return s.learned > 0 || s.reviewed > 0
    })
    .sort()
    .reverse()

  if (keys.length === 0) return 0

  const today = todayKey()
  // 允许今天还没学，从昨天开始算
  if (keys[0] !== today) {
    const y = new Date()
    y.setDate(y.getDate() - 1)
    const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
    if (keys[0] !== yKey) return 0
  }

  let streak = 0
  const cursor = new Date()
  for (const k of keys) {
    const c = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    if (k === c) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    } else if (k === today && streak === 0) {
      // 今天有记录但循环从昨天开始的情况
      continue
    } else {
      break
    }
  }
  return streak
}

/* ------------------------------ 自定义词库 (IDB) ----------------------------- */

/** 自定义词书在 IDB 中的结构 */
export interface CustomBook {
  id: string
  meta: BookMeta
  words: Word[]
  createdAt: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbGetAll(): Promise<CustomBook[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).getAll()
    req.onsuccess = () => resolve(req.result as CustomBook[])
    req.onerror = () => reject(req.error)
  })
}

export async function idbPut(book: CustomBook): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(book)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbDelete(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/* --------------------------------- 数据导入导出 -------------------------------- */

export function exportAll(): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: Date.now(),
      progress: Object.fromEntries(loadProgress()),
      settings: loadSettings(),
      dailyStats: loadDailyStats(),
    },
    null,
    2,
  )
}

export function importAll(json: string): boolean {
  try {
    const data = JSON.parse(json)
    if (data.progress) {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(data.progress))
    }
    if (data.settings) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data.settings))
    }
    if (data.dailyStats) {
      localStorage.setItem(STATS_KEY, JSON.stringify(data.dailyStats))
    }
    return true
  } catch {
    return false
  }
}

export function clearAll(): void {
  localStorage.removeItem(PROGRESS_KEY)
  localStorage.removeItem(SETTINGS_KEY)
  localStorage.removeItem(STATS_KEY)
}