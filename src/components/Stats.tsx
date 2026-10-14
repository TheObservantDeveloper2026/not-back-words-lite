/**
 * 学习统计页
 */
import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar as RBar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BookMeta, Word } from '@/data/books'
import { BOOK_COLORS } from '@/data/books'
import { computeBookStats } from '@/core/srs'
import { todayKey } from '@/core/storage'
import { useStore } from '@/store'
import { Bar, Ring, StatTile } from './ui'

export function Stats({ books, wordsByBook, currentBook }: { books: BookMeta[]; wordsByBook: Map<string, Word[]>; currentBook: string }) {
  const progress = useStore((s) => s.progress)
  const dailyStats = useStore((s) => s.dailyStats)
  const streak = useStore((s) => s.streak)
  const settings = useStore((s) => s.settings)

  const words = wordsByBook.get(currentBook) ?? []
  const book = books.find((b) => b.id === currentBook)
  const color = BOOK_COLORS[book?.color ?? 'blue'] ?? BOOK_COLORS.blue

  const bookStats = useMemo(() => computeBookStats(words.map((w) => w.id), progress), [words, progress])

  // 最近 14 天趋势
  const trend = useMemo(() => {
    const out: { date: string; label: string; learned: number; reviewed: number; correct: number; answered: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const s = dailyStats[key]
      out.push({
        date: key,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        learned: s?.learned ?? 0,
        reviewed: s?.reviewed ?? 0,
        correct: s?.correct ?? 0,
        answered: s?.answered ?? 0,
      })
    }
    return out
  }, [dailyStats])

  const totals = useMemo(() => {
    const keys = Object.keys(dailyStats)
    const learned = keys.reduce((a, k) => a + dailyStats[k].learned, 0)
    const answered = keys.reduce((a, k) => a + dailyStats[k].answered, 0)
    const correct = keys.reduce((a, k) => a + dailyStats[k].correct, 0)
    const seconds = keys.reduce((a, k) => a + dailyStats[k].seconds, 0)
    const activeDays = keys.filter((k) => dailyStats[k].answered > 0).length
    return { learned, answered, correct, seconds, activeDays, accuracy: answered > 0 ? correct / answered : 0 }
  }, [dailyStats])

  // 记忆质量分布
  const distribution = useMemo(() => {
    const buckets = [
      { label: '未学', v: bookStats.new, c: '#cbd5e1' },
      { label: '学习中', v: bookStats.learning, c: '#f59e0b' },
      { label: '复习中', v: bookStats.reviewing, c: '#3385f6' },
      { label: '已掌握', v: bookStats.mastered, c: '#10b981' },
    ]
    return buckets.filter((b) => b.v > 0)
  }, [bookStats])

  const today = dailyStats[todayKey()]

  if (!book) return null

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 概览 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="累计学习" value={totals.learned} unit="词" accent="text-brand-600 dark:text-brand-400" />
        <StatTile label="连续打卡" value={streak} unit="天" accent="text-amber-600 dark:text-amber-400" />
        <StatTile label="总正确率" value={`${Math.round(totals.accuracy * 100)}`} unit="%" accent="text-emerald-600 dark:text-emerald-400" />
        <StatTile label="学习时长" value={Math.round(totals.seconds / 60)} unit="分钟" />
      </div>

      {/* 当前词书 */}
      <section className="card p-5">
        <div className="flex items-center gap-4">
          <Ring value={bookStats.mastery} size={80} stroke={7} color="#3385f6">
            <div className="text-center">
              <div className="text-base font-bold tabular-nums">{Math.round(bookStats.mastery * 100)}%</div>
              <div className="text-[9px] text-slate-400">掌握度</div>
            </div>
          </Ring>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${color.dot}`} />
              <h3 className="truncate text-sm font-semibold">{book.name}</h3>
            </div>
            <div className="mt-2 space-y-1">
              <Row label="已掌握" value={bookStats.mastered} total={bookStats.total} color="bg-emerald-500" />
              <Row label="复习中" value={bookStats.reviewing} total={bookStats.total} color="bg-brand-500" />
              <Row label="学习中" value={bookStats.learning} total={bookStats.total} color="bg-amber-500" />
              <Row label="未学习" value={bookStats.new} total={bookStats.total} color="bg-slate-300 dark:bg-slate-700" />
            </div>
          </div>
        </div>
      </section>

      {/* 今日 */}
      <section className="card p-5">
        <h3 className="mb-3 text-sm font-semibold">今日表现</h3>
        <div className="grid grid-cols-4 gap-3 text-center">
          {[
            { l: '新学', v: today?.learned ?? 0 },
            { l: '复习', v: today?.reviewed ?? 0 },
            { l: '答题', v: today?.answered ?? 0 },
            {
              l: '正确率',
              v: `${today && today.answered > 0 ? Math.round((today.correct / today.answered) * 100) : 0}%`,
            },
          ].map((s) => (
            <div key={s.l}>
              <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{s.v}</div>
              <div className="text-[11px] text-slate-400">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Bar value={today ? today.learned / Math.max(settings.dailyNew, 1) : 0} />
          <div className="mt-1 text-[11px] text-slate-400">
            今日新词目标 {settings.dailyNew} 个
          </div>
        </div>
      </section>

      {/* 趋势图 */}
      <section className="card p-5">
        <h3 className="mb-4 text-sm font-semibold">近 14 天学习量</h3>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
              <defs>
                <linearGradient id="gLearned" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3385f6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3385f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gReviewed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} stroke="currentColor" className="text-slate-400" />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} stroke="currentColor" className="text-slate-400" />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e2e8f0' }} />
              <Area type="monotone" dataKey="learned" name="新学" stroke="#3385f6" strokeWidth={2} fill="url(#gLearned)" />
              <Area type="monotone" dataKey="reviewed" name="复习" stroke="#10b981" strokeWidth={2} fill="url(#gReviewed)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-500" /> 新学单词
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> 复习单词
          </span>
        </div>
      </section>

      {/* 记忆分布 */}
      {distribution.length > 0 && (
        <section className="card p-5">
          <h3 className="mb-3 text-sm font-semibold">记忆分布</h3>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} stroke="currentColor" className="text-slate-400" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} stroke="currentColor" className="text-slate-400" />
                <Tooltip cursor={{ fill: 'rgba(148,163,184,0.1)' }} contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e2e8f0' }} />
                <RBar dataKey="v" name="数量" radius={[6, 6, 0, 0]}>
                  {distribution.map((d, i) => (
                    <Cell key={i} fill={d.c} />
                  ))}
                </RBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  )
}

function Row({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-[10px] text-slate-400">{label}</span>
      <Bar value={total > 0 ? value / total : 0} color={color} className="h-1.5 flex-1" />
      <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-slate-400">{value}</span>
    </div>
  )
}