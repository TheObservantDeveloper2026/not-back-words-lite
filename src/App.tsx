/**
 * 主应用：页面切换 + 数据加载 + 底部导航
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BookMeta, Word } from '@/data/books'
import { BOOK_INDEX, loadBook } from '@/data/books'
import { buildQueue } from '@/core/srs'
import type { PracticeMode } from '@/core/modes'
import { idbGetAll } from '@/core/storage'
import type { CustomBook } from '@/core/storage'
import { initStore, updateSettings, useAppState } from '@/store'
import { Home } from '@/components/Home'
import { Practice } from '@/components/Practice'
import { Stats } from '@/components/Stats'
import { MyWords } from '@/components/MyWords'
import { SettingsPage } from '@/components/SettingsPage'

type Tab = 'home' | 'stats' | 'words' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: '学习', icon: '📖' },
  { id: 'stats', label: '统计', icon: '📊' },
  { id: 'words', label: '词库', icon: '📚' },
  { id: 'settings', label: '设置', icon: '⚙️' },
]

export default function App() {
  const app = useAppState()
  const [tab, setTab] = useState<Tab>('home')
  const [practice, setPractice] = useState<PracticeMode | null>(null)
  /** 练习会话开始时冻结的题目列表，保证一轮内题目稳定不变 */
  const [sessionWords, setSessionWords] = useState<Word[] | null>(null)
  const [customMeta, setCustomMeta] = useState<BookMeta[]>([])
  const [wordsByBook, setWordsByBook] = useState<Map<string, Word[]>>(new Map())
  const [loadingBook, setLoadingBook] = useState<string | null>(null)

  const currentBook = app.settings.currentBook

  useEffect(() => {
    initStore()
  }, [])

  // 主题同步
  useEffect(() => {
    document.documentElement.classList.toggle('dark', app.settings.theme === 'dark')
  }, [app.settings.theme])

  // 加载自定义词书
  const loadCustom = useCallback(async () => {
    const list: CustomBook[] = await idbGetAll()
    setCustomMeta(list.map((c) => c.meta))
    setWordsByBook((prev) => {
      const next = new Map(prev)
      list.forEach((c) => next.set(c.id, c.words))
      return next
    })
  }, [])

  useEffect(() => {
    void loadCustom()
  }, [loadCustom])

  // 内置词书分片懒加载（只加载当前词书）
  useEffect(() => {
    if (!app.ready) return
    if (wordsByBook.has(currentBook)) return
    const builtin = BOOK_INDEX.some((b) => b.id === currentBook)
    if (!builtin) return

    setLoadingBook(currentBook)
    void loadBook(currentBook).then((words) => {
      setWordsByBook((prev) => new Map(prev).set(currentBook, words))
      setLoadingBook(null)
    })
  }, [app.ready, currentBook, wordsByBook])

  const allBooks = useMemo(() => [...BOOK_INDEX, ...customMeta], [customMeta])

  /** 生成练习队列：到期复习优先 + 每日新词 */
  const queue = useMemo(() => {
    const words = wordsByBook.get(currentBook) ?? []
    if (words.length === 0) return []

    const { newWords, reviewWords } = buildQueue(
      app.progress,
      words.map((w) => w.id),
      app.settings.dailyNew,
      app.settings.dailyReview,
    )

    const byId = new Map(words.map((w) => [w.id, w]))
    const review = reviewWords.map((id) => byId.get(id)).filter(Boolean) as Word[]
    const fresh = newWords.map((id) => byId.get(id)).filter(Boolean) as Word[]

    return [...review, ...fresh].slice(0, app.settings.dailyNew + app.settings.dailyReview)
  }, [app.progress, app.settings.dailyNew, app.settings.dailyReview, currentBook, wordsByBook])

  const finishPractice = () => {
    setPractice(null)
    setSessionWords(null)
  }

  /**
   * 开始练习：把当前队列快照下来，整个练习过程都用这份固定列表。
   *
   * 否则每答一题recordAnswer 都会更新 app.progress → 上面的 queue useMemo 重算 →
   * 已答过的词从「待复习」变成「学习中」而退出队列 → words[cursor] 在会话中途变成
   * 另一个词。表现就是：题目会自己变、同一题可能被重复作答、进度错乱。
   */
  const startPractice = useCallback(
    (m: PracticeMode) => {
      setSessionWords(queue)
      setPractice(m)
    },
    [queue],
  )

  /* ------------------------------- 练习页 ------------------------------- */
  if (practice) {
    return (
      <Practice
        key={`${practice}-${currentBook}`}
        mode={practice}
        words={sessionWords ?? queue}
        book={currentBook}
        onFinish={finishPractice}
        onExit={finishPractice}
      />
    )
  }

  /* ------------------------------- 主界面 ------------------------------- */
  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <span className="text-base font-bold tracking-tight">不背单词 Lite</span>
          </div>
          {app.streak > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
              🔥 {app.streak} 天
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {loadingBook && <Loading text={`正在加载${BOOK_INDEX.find((b) => b.id === currentBook)?.name ?? '词书'}…`} />}

        {!loadingBook && tab === 'home' && (
          <Home
            books={allBooks}
            wordsByBook={wordsByBook}
            onStart={startPractice}
            onPickBook={(id) => updateSettings({ currentBook: id })}
            onGoStats={() => setTab('stats')}
          />
        )}

        {!loadingBook && tab === 'stats' && (
          <Stats books={allBooks} wordsByBook={wordsByBook} currentBook={currentBook} />
        )}

        {!loadingBook && tab === 'words' && (
          <MyWords
            customBooks={customMeta}
            wordsByBook={wordsByBook}
            onBookChanged={(meta, words) => {
              setCustomMeta((prev) => [...prev.filter((m) => m.id !== meta.id), meta])
              setWordsByBook((prev) => new Map(prev).set(meta.id, words))
            }}
          />
        )}

        {tab === 'settings' && <SettingsPage onResetDone={() => window.location.reload()} />}
      </main>

      {/* 底部导航 */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around px-2 py-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`nav-item flex-1 ${tab === t.id ? 'nav-item-active' : ''}`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function Loading({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
      <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500 dark:border-slate-700" />
      <div className="text-sm">{text}</div>
    </div>
  )
}