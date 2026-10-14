/**
 * 记忆调度引擎测试（SM-2）
 */
import { describe, expect, it } from 'vitest'
import type { WordProgress } from '@/core/srs'
import {
  applyReview,
  buildQueue,
  computeBookStats,
  createProgress,
  isDue,
  masteryLevel,
} from '@/core/srs'

const DAY = 24 * 60 * 60 * 1000

/** 快进 n 天的毫秒偏移 */
const inDays = (n: number) => n * DAY

function withNow(p: WordProgress, offset: number): WordProgress {
  return { ...p, due: p.due + offset }
}

describe('createProgress', () => {
  it('初始状态为未学习', () => {
    const p = createProgress('cet4:apple', 'cet4')
    expect(p.status).toBe('new')
    expect(p.ease).toBe(2.5)
    expect(p.interval).toBe(0)
    expect(p.reviews).toBe(0)
  })
})

describe('applyReview', () => {
  it('答对：进入复习中，间隔变长', () => {
    const p0 = createProgress('cet4:apple', 'cet4')
    const p1 = applyReview(p0, 'good')
    expect(p1.status).toBe('reviewing')
    expect(p1.interval).toBe(1)
    expect(p1.streak).toBe(1)
    expect(p1.reviews).toBe(1)
  })

  it('连续答对按 SM-2 递增间隔：1 -> 6 -> ease 倍', () => {
    let p = createProgress('cet4:apple', 'cet4')
    p = applyReview(p, 'good')
    expect(p.interval).toBe(1)

    p = applyReview(p, 'good')
    expect(p.interval).toBe(6)

    p = applyReview(p, 'good')
    expect(p.interval).toBe(Math.round(6 * p.ease))
  })

  it('答错：重置间隔，难度下调，5 分钟后重来', () => {
    let p = createProgress('cet4:apple', 'cet4')
    p = applyReview(p, 'good')
    p = applyReview(p, 'good')
    const before = p.ease

    const p2 = applyReview(p, 'again')
    expect(p2.streak).toBe(0)
    expect(p2.interval).toBe(0)
    expect(p2.ease).toBeLessThan(before)
    expect(p2.mistakes).toBe(1)
    expect(p2.status).toBe('learning')
    expect(p2.due - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000 + 1000)
  })

  it('easy：比 good 提升更快，ease 上调', () => {
    const base = createProgress('cet4:apple', 'cet4')
    const good = applyReview(base, 'good')
    const easy = applyReview(base, 'easy')
    expect(easy.interval).toBeGreaterThan(good.interval)
    expect(easy.ease).toBeGreaterThan(good.ease)
  })

  it('hard：间隔小幅增长', () => {
    const p0 = createProgress('cet4:apple', 'cet4')
    const p1 = applyReview(p0, 'hard')
    expect(p1.interval).toBe(1)
    const p2 = applyReview(p1, 'hard')
    expect(p2.interval).toBeGreaterThan(1)
    expect(p2.interval).toBeLessThan(2)
  })

  it('间隔超过阈值后判定为已掌握', () => {
    let p = createProgress('cet4:apple', 'cet4')
    for (let i = 0; i < 8; i++) p = applyReview(p, 'easy')
    expect(p.status).toBe('mastered')
    expect(p.interval).toBeGreaterThanOrEqual(21)
  })

  it('ease 保持在 1.3-3.0 区间', () => {
    let p = createProgress('cet4:apple', 'cet4')
    for (let i = 0; i < 20; i++) p = applyReview(p, 'again')
    expect(p.ease).toBeGreaterThanOrEqual(1.3)

    for (let i = 0; i < 40; i++) p = applyReview(p, 'easy')
    expect(p.ease).toBeLessThanOrEqual(3.0)
  })

  it('记录首次学习时间', () => {
    const p0 = createProgress('cet4:apple', 'cet4')
    expect(p0.learnedAt).toBe(0)
    const p1 = applyReview(p0, 'good')
    expect(p1.learnedAt).toBeGreaterThan(0)
  })

  it('不修改原对象（不可变更新）', () => {
    const p0 = createProgress('cet4:apple', 'cet4')
    const snapshot = { ...p0 }
    applyReview(p0, 'good')
    expect(p0).toEqual(snapshot)
  })
})

describe('isDue', () => {
  it('新词不算到期', () => {
    expect(isDue(createProgress('x', 'b'))).toBe(false)
  })

  it('已过期的词算到期', () => {
    const p = applyReview(createProgress('x', 'b'), 'good')
    expect(isDue(p, p.due + 1000)).toBe(true)
  })

  it('未到期的词不算到期', () => {
    const p = applyReview(createProgress('x', 'b'), 'good')
    expect(isDue(p, p.due - 1000)).toBe(false)
  })
})

describe('masteryLevel', () => {
  it('新词掌握度为 0', () => {
    expect(masteryLevel(createProgress('x', 'b'))).toBe(0)
  })

  it('已掌握为 1', () => {
    let p = createProgress('x', 'b')
    for (let i = 0; i < 10; i++) p = applyReview(p, 'easy')
    expect(masteryLevel(p)).toBe(1)
  })

  it('掌握度随练习次数上升', () => {
    let p = createProgress('x', 'b')
    const before = masteryLevel(p)
    p = applyReview(p, 'good')
    expect(masteryLevel(p)).toBeGreaterThan(before)
  })
})

describe('buildQueue', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']

  it('全部新词时全部进入新词队列', () => {
    const progress = new Map<string, WordProgress>()
    const q = buildQueue(progress, ids, 10, 10)
    expect(q.newWords).toHaveLength(5)
    expect(q.reviewWords).toHaveLength(0)
  })

  it('新词数量受上限限制', () => {
    const q = buildQueue(new Map(), ids, 3, 10)
    expect(q.newWords).toHaveLength(3)
  })

  it('到期复习词优先于新词', () => {
    const progress = new Map<string, WordProgress>()
    let p = applyReview(createProgress('a', 'b'), 'good')
    p = { ...p, due: Date.now() - 1000 } // 制造到期
    progress.set('a', p)

    const q = buildQueue(progress, ids, 10, 10)
    expect(q.reviewWords).toContain('a')
    expect(q.newWords).not.toContain('a')
    expect(q.newWords).toHaveLength(4)
  })

  it('未到期的复习词不进入队列', () => {
    const progress = new Map<string, WordProgress>()
    const p = applyReview(createProgress('a', 'b'), 'good') // due 在未来
    progress.set('a', p)
    const q = buildQueue(progress, ids, 10, 10)
    expect(q.reviewWords).toHaveLength(0)
    expect(q.newWords).not.toContain('a')
  })

  it('复习队列按到期时间排序（越久越优先）', () => {
    const progress = new Map<string, WordProgress>()
    const now = Date.now()
    progress.set('a', { ...applyReview(createProgress('a', 'b'), 'good'), due: now - 3000 })
    progress.set('b', { ...applyReview(createProgress('b', 'b'), 'good'), due: now - 1000 })
    progress.set('c', { ...applyReview(createProgress('c', 'b'), 'good'), due: now - 2000 })

    const q = buildQueue(progress, ids, 10, 10)
    expect(q.reviewWords[0]).toBe('a')
    expect(q.reviewWords[1]).toBe('c')
    expect(q.reviewWords[2]).toBe('b')
  })

  it('复习队列受上限限制', () => {
    const progress = new Map<string, WordProgress>()
    const now = Date.now()
    for (const id of ids) {
      progress.set(id, { ...applyReview(createProgress(id, 'b'), 'good'), due: now - 1000 })
    }
    const q = buildQueue(progress, ids, 10, 2)
    expect(q.reviewWords).toHaveLength(2)
  })
})

describe('computeBookStats', () => {
  it('空词书统计正常', () => {
    const s = computeBookStats([], new Map())
    expect(s.total).toBe(0)
    expect(s.mastery).toBe(0)
  })

  it('统计各状态数量', () => {
    const progress = new Map<string, WordProgress>()
    progress.set('a', applyReview(createProgress('a', 'b'), 'good'))
    progress.set('b', applyReview(createProgress('b', 'b'), 'good'))
    progress.set('c', { ...createProgress('c', 'b'), status: 'learning' })

    const s = computeBookStats(['a', 'b', 'c', 'd'], progress)
    expect(s.total).toBe(4)
    expect(s.reviewing).toBe(2)
    expect(s.learning).toBe(1)
    expect(s.new).toBe(1)
  })

  it('掌握度在 0-1 之间', () => {
    const progress = new Map<string, WordProgress>()
    for (const id of ['a', 'b']) {
      progress.set(id, applyReview(createProgress(id, 'b'), 'good'))
    }
    const s = computeBookStats(['a', 'b', 'c'], progress)
    expect(s.mastery).toBeGreaterThanOrEqual(0)
    expect(s.mastery).toBeLessThanOrEqual(1)
  })
})

describe('withNow (测试辅助)', () => {
  it('偏移到期时间', () => {
    const p = createProgress('x', 'b')
    expect(withNow(p, inDays(1)).due).toBe(p.due + DAY)
  })
})