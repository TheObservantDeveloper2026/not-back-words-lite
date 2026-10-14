/**
 * 练习会话：单题作答 -> 判分 -> 记忆调度 -> 下一题
 * 支持四种模式：英译汉 / 汉译英 / 默写 / 听写
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Word } from '@/data/books'
import type { PracticeMode } from '@/core/modes'
import { MODES, buildChoices, spellHint } from '@/core/modes'
import { speak, stopSpeaking } from '@/core/speech'
import { accuracyPercent, judgeChoice, judgeInput } from '@/core/judge'
import type { AnswerResult } from '@/core/srs'
import { applyReview } from '@/core/srs'
import { getProgress, recordAnswer, toggleStar, useAppState } from '@/store'

/** 判分结果 */
type Judge =
  | { state: 'idle' }
  | { state: 'correct' }
  | { state: 'wrong'; correctAnswer: string }

export interface PracticeProps {
  mode: PracticeMode
  words: Word[]
  /** 当前词书 id */
  book: string
  /** 队列推进到底后回调 */
  onFinish: () => void
  /** 退出练习 */
  onExit: () => void
}

export function Practice({ mode, words, book, onFinish, onExit }: PracticeProps) {
  const app = useAppState()
  const meta = MODES[mode]

  const [cursor, setCursor] = useState(0)
  const [judge, setJudge] = useState<Judge>({ state: 'idle' })
  const [input, setInput] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  /** 实际作答次数（不是题目序号）——正确率的分母 */
  const [answered, setAnswered] = useState(0)
  const [streak, setStreak] = useState(0)
  const [starred, setStarred] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const startedAt = useRef(Date.now())
  /**
   * 已经作答过的题目序号集合。
   * 队列会因为学习进度更新而在会话中重建，导致同一个 cursor 可能两次拿到不同的
   * current 对象；如果只用judge.state 做守卫，重建后judge 被重置就能对同一题反复
   * 作答，correctCount 累加而 cursor 不动，正确率就会突破 100%。
   * 这里用「题目序号 + 目标词 id」双重锁定，确保一题只记一次。
   */
  const answeredKeys = useRef(new Set<string>())

  const current = words[cursor]
  const total = words.length
  const currentKey = current ? `${cursor}:${current.id}` : ''

  // 选项（英译汉模式）
  const choices = useMemo(() => {
    if (mode !== 'en2cn' || !current) return []
    return buildChoices(current, words, 4)
  }, [mode, current, words])

  // 首字母提示（默写模式）
  const hint = useMemo(() => {
    if (mode !== 'spell' || !current) return ''
    return spellHint(current.word)
  }, [mode, current])

  // 自动发音（英译汉/默写）或自动播放（听写）
  // 注意：依赖里用 currentKey（cursor+word.id）而不是 current 对象。
  // 队列在学习进度更新时会重建，current 会变成新对象；若直接依赖 current，
  // 每次答题后这个effect 都会重跑并把 judge 重置回idle，导致同一题可重复作答。
  useEffect(() => {
    if (!current) return
    startedAt.current = Date.now()
    setJudge({ state: 'idle' })
    setInput('')
    setSelected(null)
    setStarred(false)

    if (meta.needAudio || app.settings.autoSpeak) {
      // 听写模式故意延迟，模拟"听一遍再写"
      const delay = mode === 'listen' ? 400 : 250
      const t = setTimeout(() => {
        speak(current.word, { voice: app.settings.voice, rate: app.settings.rate })
      }, delay)
      return () => clearTimeout(t)
    }
  }, [
    currentKey,
    current,
    meta.needAudio,
    mode,
    app.settings.voice,
    app.settings.rate,
    app.settings.autoSpeak,
  ])

  // 输入模式自动聚焦
  useEffect(() => {
    if (meta.input && judge.state === 'idle') {
      inputRef.current?.focus()
    }
  }, [meta.input, judge.state])

  // 结果页键盘快捷键：空格/回车进入下一题
  // 注意：提交后要短暂冷却，否则按回车提交会立刻再次触发 next()，
  // 导致判分反馈一闪而过、用户根本看不到正确答案。
  const lockUntil = useRef(0)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (judge.state === 'idle') return
      if (Date.now() < lockUntil.current) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        lockUntil.current = Date.now() + 400
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** 提交当前题 */
  const submit = useCallback(
    (result: AnswerResult, correct: boolean, correctAnswer: string) => {
      if (!current) return
      // 一题只记一次：重复作答直接忽略，杜绝正确率虚高
      if (answeredKeys.current.has(currentKey)) return
      answeredKeys.current.add(currentKey)

      const prev = getProgress(current.id, book)
      const nextProgress = applyReview(prev, result)

      recordAnswer(current.id, book, nextProgress, correct, (Date.now() - startedAt.current) / 1000)

      setJudge(correct ? { state: 'correct' } : { state: 'wrong', correctAnswer })
      setAnswered((n) => n + 1)
      if (correct) {
        setCorrectCount((c) => c + 1)
        setStreak((s) => s + 1)
      } else {
        setStreak(0)
      }
    },
    [current, currentKey, book],
  )

  /** 选择答案（英译汉） */
  const choose = useCallback(
    (choiceWord: Word) => {
      if (judge.state !== 'idle' || !current) return
      if (answeredKeys.current.has(currentKey)) return

      const optionWords = choices.map((c) => c.word)
      const { correct, answerKey } = judgeChoice(choiceWord.word, current.word, optionWords)
      setSelected(choiceWord.word)
      submit(correct ? 'good' : 'again', correct, answerKey)
    },
    [judge.state, current, currentKey, choices, submit],
  )

  /** 提交输入（汉译英/默写/听写） */
  const submitInput = useCallback(() => {
    if (judge.state !== 'idle' || !current || !input.trim()) return
    if (answeredKeys.current.has(currentKey)) return

    const { correct, answerKey } = judgeInput(input, current.word, mode === 'listen')
    submit(correct ? 'good' : 'again', correct, answerKey)
  }, [judge.state, current, currentKey, input, mode, submit])

  /** 下一题 / 完成 */
  const next = useCallback(() => {
    stopSpeaking()
    if (cursor + 1 >= total) {
      onFinish()
    } else {
      setCursor((c) => c + 1)
    }
  }, [cursor, total, onFinish])

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-4xl">{'\u{1F389}'}</div>
        <h2 className="mt-4 text-lg font-semibold">本轮练习完成</h2>
        <p className="mt-1 text-sm text-slate-400">
          答对 {correctCount} / {total}
        </p>
        <div className="mt-6 flex gap-3">
          <button className="btn-outline" onClick={onExit}>
            返回
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              setCursor(0)
              setCorrectCount(0)
              setAnswered(0)
              setStreak(0)
              answeredKeys.current.clear()
            }}
          >
            再练一轮
          </button>
        </div>
      </div>
    )
  }

  const pct = total > 0 ? (cursor / total) * 100 : 0
  const senses = current.definitions.map(([pos, cn]) => ({ pos, cn }))

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-8 pt-4">
      {/* 顶栏 */}
      <div className="flex items-center gap-3">
        <button className="btn-ghost -ml-2 px-2" onClick={onExit} aria-label="退出练习">
          <span className="text-lg">✕</span>
        </button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-slate-400">
          {cursor + 1}/{total}
        </span>
      </div>

      {/* 连对提示 */}
      {streak >= 3 && judge.state === 'idle' && (
        <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-amber-500 animate-pop-in">
          <span>{'\u{1F525}'}</span> 连对 {streak} 个
        </div>
      )}

      {/* 题面 */}
      <div className="flex flex-1 flex-col justify-center py-6">
        <div className="mb-5 text-center text-xs font-medium text-slate-400">{meta.hint}</div>

        {/* 英译汉 / 默写：展示英文 */}
        {(mode === 'en2cn' || mode === 'spell') && (
          <div className="text-center">
            <div className="flex items-center justify-center gap-3">
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-5xl">
                {mode === 'spell' ? hint : current.word}
              </h1>
              <button
                className="btn-ghost h-9 w-9 rounded-full p-0 text-base"
                onClick={() => speak(current.word, { voice: app.settings.voice, rate: app.settings.rate })}
                aria-label="播放发音"
              >
                {'\u{1F50A}'}
              </button>
            </div>
            {current.phonetic && mode !== 'spell' && (
              <div className="mt-2 text-sm text-slate-400">/{current.phonetic.replace(/^\/|\/$/g, '')}/</div>
            )}
          </div>
        )}

        {/* 汉译英：展示中文 */}
        {mode === 'cn2en' && (
          <div className="text-center">
            <h1 className="text-3xl font-bold leading-snug text-slate-900 dark:text-slate-50">
              {senses.map((s) => s.cn).slice(0, 2).join('；')}
            </h1>
            <div className="mt-2 text-sm text-slate-400">
              {senses[0]?.pos}
            </div>
          </div>
        )}

        {/* 听写：只有喇叭 */}
        {mode === 'listen' && (
          <div className="flex flex-col items-center gap-3">
            <button
              className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-3xl
                         text-brand-600 ring-1 ring-brand-200 transition hover:bg-brand-100 active:scale-95
                         dark:bg-brand-500/10 dark:ring-brand-500/30 dark:text-brand-400"
              onClick={() => speak(current.word, { voice: app.settings.voice, rate: app.settings.rate })}
            >
              {'\u{1F507}'}
            </button>
            <button
              className="text-xs font-medium text-slate-400 hover:text-brand-600"
              onClick={() => speak(current.word, { voice: app.settings.voice, rate: app.settings.rate })}
            >
              再听一遍
            </button>
          </div>
        )}

        {/* 作答区 */}
        <div className="mt-7">
          {mode === 'en2cn' ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {choices.map((c) => {
                const isTarget = c.word === current.word
                const picked = selected === c.word
                const revealed = judge.state !== 'idle'
                let cls =
                  'flex items-center justify-between rounded-xl px-4 py-3.5 text-left text-sm ring-1 transition-all'
                if (!revealed) cls += ' bg-white ring-slate-200 hover:ring-brand-400 hover:bg-brand-50/40 dark:bg-slate-900 dark:ring-slate-700'
                else if (isTarget) cls += ' bg-emerald-50 ring-emerald-400 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
                else if (picked) cls += ' bg-rose-50 ring-rose-400 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300'
                else cls += ' bg-white/60 ring-slate-200 text-slate-400 dark:bg-slate-900/50 dark:ring-slate-800'
                return (
                  <button key={c.word} className={cls} onClick={() => choose(c)} disabled={revealed}>
                    <span className="leading-snug">
                      <span className="mr-1.5 font-medium">{c.definitions[0]?.[0]}</span>
                      {c.definitions[0]?.[1]}
                    </span>
                    {revealed && isTarget && <span>{'\u2713'}</span>}
                  </button>
                )
              })}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submitInput()
              }}
              className="space-y-3"
            >
              <div className="relative">
                <input
                  ref={inputRef}
                  className={`input pr-24 ${judge.state === 'correct' ? 'input-correct' : ''} ${judge.state === 'wrong' ? 'input-wrong' : ''}`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="在这里输入答案"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={judge.state !== 'idle'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  {input.length}/{current.word.length}
                </span>
              </div>
              {judge.state === 'idle' && (
                <button type="submit" className="btn-primary w-full py-3" disabled={!input.trim()}>
                  提交
                </button>
              )}
            </form>
          )}
        </div>

        {/* 反馈区 */}
        {judge.state !== 'idle' && (
          <div className="mt-5 animate-slide-up">
            <div
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${
                judge.state === 'correct'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
              }`}
            >
              <span>{judge.state === 'correct' ? '\u2705' : '\u274C'}</span>
              {judge.state === 'correct' ? '答对了' : `正确答案：${judge.correctAnswer}`}
              <button
                className="ml-auto text-xs font-normal opacity-70 hover:opacity-100"
                onClick={() => speak(current.word, { voice: app.settings.voice, rate: app.settings.rate })}
              >
                {'\u{1F50A}'} 发音
              </button>
              <button
                className={`ml-1 text-xs font-normal opacity-70 hover:opacity-100 ${starred ? '' : 'ml-2'}`}
                onClick={() => setStarred(toggleStar(current.id))}
              >
                {starred ? '\u2B50' : '\u2606'}
              </button>
            </div>

            {/* 完整释义 */}
            <div className="card mt-3 p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900 dark:text-slate-50">{current.word}</span>
                {current.phonetic && <span className="text-xs text-slate-400">/{current.phonetic.replace(/^\/|\/$/g, '')}/</span>}
              </div>
              <ul className="mt-2 space-y-1">
                {senses.map((s, i) => (
                  <li key={i} className="text-sm text-slate-600 dark:text-slate-300">
                    <span className="mr-1.5 font-medium text-slate-400">{s.pos}</span>
                    {s.cn}
                  </li>
                ))}
              </ul>
              {current.tip && (
                <div className="mt-2 text-xs text-slate-400">
                  <span className="font-medium">记忆：</span>
                  {current.tip}
                </div>
              )}
            </div>

            <button className="btn-primary mt-4 w-full py-3" onClick={next} autoFocus>
              {cursor + 1 >= total ? '查看结果' : '继续'}
              <span className="text-xs opacity-70">(空格)</span>
            </button>
          </div>
        )}
      </div>

      {/* 底部进度统计 */}
      <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-400 dark:border-slate-800">
        <span>
          正确率{' '}
          <span className="font-medium text-slate-600 dark:text-slate-300">
            {accuracyPercent(correctCount, answered)}%
          </span>
          <span className="ml-1.5 text-slate-400">
            ({correctCount}/{answered})
          </span>
        </span>
        <span>{app.streak > 0 ? `\u{1F525} 连续打卡 ${app.streak} 天` : '开始你的第一次学习吧'}</span>
      </div>
    </div>
  )
}