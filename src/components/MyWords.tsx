/**
 * 我的词库：收藏单词 + 自定义词书管理
 */
import { useMemo, useRef, useState } from 'react'
import type { BookMeta, Word } from '@/data/books'
import { parseWordlist, toCSV } from '@/core/import'
import type { CustomBook } from '@/core/storage'
import { idbDelete, idbGetAll, idbPut } from '@/core/storage'
import { speak } from '@/core/speech'
import { setCustomBooks, useStore } from '@/store'
import { Badge, Empty } from './ui'

const SAMPLE = `apple n. 苹果
banana [bəˈnɑːnə] n. 香蕉
hello,你好
world 世界
good adj. 好的
read | 阅读 | riːd`

export function MyWords({
  customBooks,
  wordsByBook,
  onBookChanged,
}: {
  customBooks: BookMeta[]
  wordsByBook: Map<string, Word[]>
  onBookChanged: (book: BookMeta, words: Word[]) => void
}) {
  const [tab, setTab] = useState<'starred' | 'custom'>('starred')
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {([
          ['starred', '收藏夹'],
          ['custom', '自定义词库'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              tab === id
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-50'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'starred' ? (
        <StarredList wordsByBook={wordsByBook} />
      ) : (
        <CustomBookList
          customBooks={customBooks}
          wordsByBook={wordsByBook}
          onBookChanged={onBookChanged}
        />
      )}
    </div>
  )
}

/* -------------------------------- 收藏夹 -------------------------------- */

function StarredList({ wordsByBook }: { wordsByBook: Map<string, Word[]> }) {
  const settings = useStore((s) => s.settings)
  // 收藏状态存 localStorage，用 tick 触发重渲染
  const [starredIds, setStarredIds] = useState<string[]>(() => safeList(localStorage.getItem(STAR_KEY)))

  const starred = useMemo(() => {
    const out: Word[] = []
    for (const id of starredIds) {
      const book = id.split(':')[0]
      const found = (wordsByBook.get(book) ?? []).find((w) => w.id === id)
      if (found) out.push(found)
    }
    return out
  }, [starredIds, wordsByBook])

  const unstar = (id: string) => {
    const next = starredIds.filter((s) => s !== id)
    setStarredIds(next)
    localStorage.setItem(STAR_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event('bbdict:star'))
  }

  if (starred.length === 0) {
    return (
      <Empty
        icon="⭐"
        title="收藏夹是空的"
        desc="练习时点击 ☆ 可以把拿不准的单词收藏起来，方便之后重点攻克"
      />
    )
  }

  return (
    <div className="space-y-2">
      <div className="px-1 text-xs text-slate-400">共 {starred.length} 个收藏单词</div>
      {starred.map((w) => (
        <div key={w.id} className="card flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold text-slate-900 dark:text-slate-50">{w.word}</span>
              {w.phonetic && <span className="shrink-0 text-[11px] text-slate-400">{w.phonetic}</span>}
              <button
                className="shrink-0 text-slate-300 hover:text-brand-500"
                onClick={() => speak(w.word, { voice: settings.voice, rate: settings.rate })}
                aria-label="播放"
              >
                🔊
              </button>
            </div>
            <div className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
              {w.definitions.map(([pos, cn]) => `${pos}${cn}`).join('；') || '（无释义）'}
            </div>
          </div>
          <button
            className="shrink-0 px-2 text-amber-400 hover:text-amber-500"
            onClick={() => unstar(w.id)}
            aria-label="取消收藏"
          >
            ★
          </button>
        </div>
      ))}
    </div>
  )
}

const STAR_KEY = 'bbdict.starred.v1'

function safeList(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/* ------------------------------ 自定义词库 ------------------------------ */

function CustomBookList({
  customBooks,
  wordsByBook,
  onBookChanged,
}: {
  customBooks: BookMeta[]
  wordsByBook: Map<string, Word[]>
  onBookChanged: (book: BookMeta, words: Word[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState<Word[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /** 统一入口：设置文本并解析 */
  const applyText = (raw: string) => {
    setText(raw)
    parse(raw)
  }

  const parse = (raw: string) => {
    const id = `custom_${Date.now()}`
    const result = parseWordlist(raw, id)
    if (result.words.length === 0) {
      setErr('没有解析出有效的单词。请检查格式，例如：\napple n. 苹果\nhello,你好')
      setPreview(null)
      return null
    }
    setErr('')
    setPreview(result.words)
    return result.words
  }

  const handleFile = async (file: File) => {
    const raw = await file.text()
    applyText(raw.slice(0, 200_000))
  }

  const save = async () => {
    if (!preview) return
    const id = `custom_${Date.now()}`
    const bookName = name.trim() || `我的词库 ${customBooks.length + 1}`
    // 重建 id 以匹配已保存的 bookId
    const words = preview.map((w) => ({ ...w, id: `${id}:${w.word.toLowerCase()}`, book: id }))
    const meta: BookMeta = {
      id,
      name: bookName,
      shortName: '自建',
      description: `自定义词库，共 ${words.length} 词`,
      color: 'emerald',
      totalCount: words.length,
    }
    const record: CustomBook = { id, meta, words, createdAt: Date.now() }
    await idbPut(record)

    const custom = await idbGetAll()
    setCustomBooks(custom.map((c) => c.meta))
    onBookChanged(meta, words)

    setOpen(false)
    setText('')
    setName('')
    setPreview(null)
  }

  const remove = async (id: string) => {
    if (!confirm('确定删除这个自定义词库吗？此操作不可撤销。')) return
    await idbDelete(id)
    const custom = await idbGetAll()
    setCustomBooks(custom.map((c) => c.meta))
  }

  return (
    <div className="space-y-3">
      <button className="btn-primary w-full py-3" onClick={() => setOpen((o) => !o)}>
        {open ? '取消' : '＋ 导入词库'}
      </button>

      {open && (
        <div className="card space-y-3 p-4 animate-slide-up">
          <input
            className="input"
            placeholder="词库名称（可选）"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* 粘贴区 */}
          <textarea
            className="input min-h-40 resize-y font-mono text-sm"
            placeholder={'每行一个单词，支持多种格式：\n\napple n. 苹果\nbanana [bəˈnɑːnə] n. 香蕉\nhello,你好\nread | 阅读 | riːd'}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              parse(e.target.value)
            }}
          />

          {/* 文件导入 */}
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => fileRef.current?.click()}>
              选择文件
            </button>
            <button
              className="btn-ghost"
              onClick={() => applyText(SAMPLE)}
            >
              填入示例
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,.json,.tsv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />
          </div>

          {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{err}</div>}

          {preview && preview.length > 0 && (
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                解析成功 {preview.length} 个单词 · 前 5 条预览
              </div>
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {preview.slice(0, 5).map((w) => (
                  <li key={w.word} className="truncate">
                    <span className="font-semibold">{w.word}</span>
                    <span className="ml-2 text-slate-400">{w.phonetic}</span>
                    <span className="ml-2">{w.definitions.map(([p, c]) => `${p}${c}`).join('；') || '（无释义）'}</span>
                  </li>
                ))}
              </ul>
              <button className="btn-primary mt-3 w-full" onClick={() => void save()}>
                保存词库
              </button>
            </div>
          )}

          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer select-none">支持的格式说明</summary>
            <ul className="mt-2 space-y-1 pl-4">
              <li>apple n. 苹果</li>
              <li>banana [bəˈnɑːnə] n. 香蕉</li>
              <li>hello,你好（逗号分隔）</li>
              <li>read | 阅读 | riːd（竖线分隔，最后为音标）</li>
              <li>制表符分隔（直接从 Excel 复制两列）</li>
              <li>仅单词（无释义，适合听写练习）</li>
              <li>JSON：[{`{"word":"x","mean":"释义"}`}]</li>
            </ul>
          </details>
        </div>
      )}

      {/* 已保存的词库 */}
      {customBooks.length === 0 ? (
        <Empty icon="📚" title="还没有自定义词库" desc="导入自己的单词表，比如生词本、专业术语、考试词汇" />
      ) : (
        <div className="space-y-2">
          {customBooks.map((b) => {
            const words = wordsByBook.get(b.id) ?? []
            return (
              <div key={b.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{b.name}</span>
                      <Badge tone="emerald">自建</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {b.totalCount} 词 · {new Date(Date.now()).toLocaleDateString()} 前导入
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="btn-ghost px-2 text-xs"
                      onClick={() => {
                        const blob = new Blob([toCSV(words)], { type: 'text/csv;charset=utf-8' })
                        const a = document.createElement('a')
                        a.href = URL.createObjectURL(blob)
                        a.download = `${b.name}.csv`
                        a.click()
                        URL.revokeObjectURL(a.href)
                      }}
                    >
                      导出
                    </button>
                    <button className="btn-ghost px-2 text-xs text-rose-500" onClick={() => void remove(b.id)}>
                      删除
                    </button>
                  </div>
                </div>

                {words.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {words.slice(0, 12).map((w) => (
                      <span
                        key={w.id}
                        className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {w.word}
                      </span>
                    ))}
                    {words.length > 12 && (
                      <span className="px-2 py-1 text-[11px] text-slate-400">+{words.length - 12}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}