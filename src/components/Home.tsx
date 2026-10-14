/**
 * 首页：今日任务 + 词书进度
 */
import { useMemo } from 'react'
import { BOOK_COLORS } from '@/data/books'
import type { BookMeta, Word } from '@/data/books'
import { computeBookStats } from '@/core/srs'
import { emptyStat, todayKey } from '@/core/storage'
import { useStore } from '@/store'
import { Bar, Ring } from './ui'
import type { PracticeMode } from '@/core/modes'
import { MODE_LIST } from '@/core/modes'

export interface HomeProps {
  books: BookMeta[]
  wordsByBook: Map<string, Word[]>
  onStart: (mode: PracticeMode) => void
  onPickBook: (bookId: string) => void
  onGoStats: () => void
}

export function Home({ books, wordsByBook, onStart, onPickBook, onGoStats }: HomeProps) {
  const settings = useStore((s) => s.settings)
  const progress = useStore((s) => s.progress)
  const dailyStats = useStore((s) => s.dailyStats)
  const streak = useStore((s) => s.streak)

  const currentBook = books.find((b) => b.id === settings.currentBook) ?? books[0]
  const words = wordsByBook.get(currentBook?.id ?? '') ?? []

  const stats = useMemo(() => {
    const ids = words.map((w) => w.id)
    return computeBookStats(ids, progress)
  }, [words, progress])

  const today = dailyStats[todayKey()] ?? emptyStat()
  const newTarget = settings.dailyNew
  const newDone = Math.min(today.learned, newTarget)
  const dueCount = useMemo(() => {
    const now = Date.now()
    return words.filter((w) => {
      const p = progress.get(w.id)
      return p && p.status !== 'new' && p.due <= now
    }).length
  }, [words, progress])

  if (!currentBook) return null
  const color = BOOK_COLORS[currentBook.color] ?? BOOK_COLORS.blue

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 今日任务 */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">今日学习</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {streak > 0 ? `${'\u{1F525}'} 已连续打卡 ${streak} 天，继续保持` : '完成今天的目标，开启连续打卡'}
            </p>
          </div>
          <Ring value={newTarget > 0 ? newDone / newTarget : 0} size={56} stroke={5}>
            <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
              {newDone}/{newTarget}
            </span>
          </Ring>
        </div>

        {/* 模式入口 */}
        <div className="grid grid-cols-2 gap-2 px-4 pb-4 pt-3 sm:grid-cols-4">
          {MODE_LIST.map((m) => (
            <button
              key={m.id}
              onClick={() => onStart(m.id)}
              className="group flex flex-col items-center gap-1.5 rounded-xl px-2 py-3.5
                         ring-1 ring-slate-200 transition-all hover:ring-brand-400 hover:bg-brand-50/50
                         active:scale-[0.97] dark:ring-slate-800 dark:hover:bg-brand-500/10"
            >
              <span className="text-xl">{m.icon}</span>
              <span className="text-xs font-medium text-slate-700 group-hover:text-brand-700 dark:text-slate-200 dark:group-hover:text-brand-300">
                {m.shortName}
              </span>
            </button>
          ))}
        </div>

        {/* 待复习提示 */}
        {dueCount > 0 && (
          <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 text-xs dark:border-slate-800">
            <span className="text-amber-500">{'\u23F0'}</span>
            <span className="text-slate-500 dark:text-slate-400">
              有 <span className="font-semibold text-slate-700 dark:text-slate-200">{dueCount}</span> 个单词待复习
            </span>
          </div>
        )}
      </section>

      {/* 当前词书进度 */}
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{currentBook.name}</h3>
            <span className="text-xs text-slate-400">{stats.total} 词</span>
          </div>
          <button className="btn-ghost px-2 text-xs" onClick={onGoStats}>
            查看统计 {'>'}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <Ring value={stats.mastery} size={64} stroke={6} color="#3385f6">
            <span className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
              {Math.round(stats.mastery * 100)}%
            </span>
          </Ring>
          <div className="flex-1 space-y-1.5">
            {[
              { label: '已掌握', v: stats.mastered, c: 'bg-emerald-500' },
              { label: '复习中', v: stats.reviewing, c: 'bg-brand-500' },
              { label: '学习中', v: stats.learning, c: 'bg-amber-500' },
              { label: '未学习', v: stats.new, c: 'bg-slate-300 dark:bg-slate-700' },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-2">
                <span className="w-11 shrink-0 text-[11px] text-slate-400">{row.label}</span>
                <Bar value={stats.total > 0 ? row.v / stats.total : 0} color={row.c} className="h-1.5 flex-1" />
                <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{row.v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 词书列表 */}
      <section>
        <h3 className="mb-2.5 px-1 text-sm font-semibold text-slate-900 dark:text-slate-50">选择词书</h3>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {books.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              active={b.id === currentBook.id}
              words={wordsByBook.get(b.id) ?? []}
              progress={progress}
              onClick={() => onPickBook(b.id)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function BookCard({
  book,
  active,
  words,
  progress,
  onClick,
}: {
  book: BookMeta
  active: boolean
  words: Word[]
  progress: Map<string, { status: string }>
  onClick: () => void
}) {
  const stats = useMemo(() => {
    let mastered = 0
    let touched = 0
    for (const w of words) {
      const p = progress.get(w.id)
      if (!p || p.status === 'new') continue
      touched += 1
      if (p.status === 'mastered') mastered += 1
    }
    return { mastered, touched, total: words.length }
  }, [words, progress])

  const color = BOOK_COLORS[book.color] ?? BOOK_COLORS.blue
  const pct = stats.total > 0 ? stats.mastered / stats.total : 0

  return (
    <button
      onClick={onClick}
      className={`card flex items-center gap-3 p-4 text-left transition-all hover:shadow-md active:scale-[0.99] ${
        active ? `ring-2 ${color.ring}` : ''
      }`}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base ${color.bg} ${color.text}`}>
        {book.shortName.slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{book.name}</span>
          {active && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${color.bg} ${color.text}`}>当前</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-slate-400">{book.description}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <Bar value={pct} color={color.dot} className="h-1 flex-1" />
          <span className="text-[10px] tabular-nums text-slate-400">
            {stats.mastered}/{stats.total}
          </span>
        </div>
      </div>
    </button>
  )
}