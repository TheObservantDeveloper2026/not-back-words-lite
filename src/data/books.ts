/**
 * 词库数据模型 + 分片懒加载
 */
import type { Sense } from './types'

/** 词库分片中的紧凑词条（单字母字段以压缩体积，读入后展开为 Word） */
export interface RawWord {
  /** word */
  w: string
  /** phonetic */
  p: string
  /** freq 词频等级 */
  f: number
  /** definitions [pos, cn][] */
  d: Sense[]
  /** tip 记忆技巧 */
  y?: string
}

/** 词书索引条目 */
export interface BookMeta {
  id: string
  name: string
  shortName: string
  description: string
  color: string
  totalCount: number
}

/** 运行时单词对象 */
export interface Word {
  id: string
  book: string
  word: string
  phonetic: string
  freq: number
  definitions: Sense[]
  tip?: string
}

export const BOOK_COLORS: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', dot: 'bg-emerald-500' },
  sky: { bg: 'bg-sky-50', text: 'text-sky-700', ring: 'ring-sky-200', dot: 'bg-sky-500' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-200', dot: 'bg-indigo-500' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200', dot: 'bg-blue-500' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-200', dot: 'bg-violet-500' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-200', dot: 'bg-rose-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200', dot: 'bg-amber-500' },
}

/**
 * 词书索引（静态引入，体积很小 ~1KB）
 * 注意：index.json 必须被 glob 排除，否则会被误判为词书分片
 */
/**
 * 词书索引（静态引入，体积很小 ~1KB）
 */
import BOOK_INDEX_RAW from './books/index.json'

export const BOOK_INDEX: BookMeta[] = BOOK_INDEX_RAW as BookMeta[]

/** 词书分片懒加载缓存 */
const cache = new Map<string, Word[]>()

// 排除 index.json（它是词书索引，不是单词分片）
// 注意：这里不用 { import: 'default' }，因为 Vite 对 JSON 分片的动态导入
// 返回的是模块命名空间，读取 default 的行为在不同版本/模式下不一致。
const rawLoaders = import.meta.glob<RawWord[]>(['./books/*.json', '!./books/index.json'])

/**
 * 加载某词书的全部单词
 */
export async function loadBook(bookId: string): Promise<Word[]> {
  if (cache.has(bookId)) return cache.get(bookId)!

  const key = Object.keys(rawLoaders).find((k) => k.endsWith(`/books/${bookId}.json`))
  if (!key) {
    // 自定义词书由 IndexedDB 提供，不走这里
    return []
  }

  const mod = await rawLoaders[key]()
  const list = Array.isArray(mod) ? mod : (mod as { default?: RawWord[] }).default ?? []
  const words: Word[] = list.map((r) => ({
    id: `${bookId}:${r.w.toLowerCase()}`,
    book: bookId,
    word: r.w,
    phonetic: r.p,
    freq: r.f,
    definitions: r.d,
    tip: r.y,
  }))
  cache.set(bookId, words)
  return words
}

/** 判断是否为内置词书 */
export function isBuiltinBook(bookId: string): boolean {
  return BOOK_INDEX.some((b) => b.id === bookId)
}

/** 构造单词对象（用于自定义词书 / 在线词典兜底） */
export function makeWord(
  input: {
    word: string
    phonetic?: string
    freq?: number
    definitions?: Sense[]
    tip?: string
  },
  book: string,
): Word {
  return {
    id: `${book}:${input.word.toLowerCase()}`,
    book,
    word: input.word,
    phonetic: input.phonetic ?? '',
    freq: input.freq ?? 3,
    definitions: input.definitions ?? [],
    tip: input.tip,
  }
}