import { describe, expect, it } from 'vitest'
import { accuracyPercent, judgeChoice, judgeInput, normalizeAnswer } from './judge'

describe('normalizeAnswer', () => {
  it('忽略大小写与首尾空格', () => {
    expect(normalizeAnswer('  Abandon  ')).toBe('abandon')
  })

  it('忽略中英文标点', () => {
    expect(normalizeAnswer("don't.")).toBe('dont')
    expect(normalizeAnswer('放弃，')).toBe('放弃')
  })

  it('合并重复空格', () => {
    expect(normalizeAnswer('ice   cream')).toBe('ice cream')
  })
})

describe('judgeInput', () => {
  it('完全一致判对', () => {
    expect(judgeInput('abandon', 'abandon').correct).toBe(true)
  })

  it('忽略大小写和标点判对', () => {
    expect(judgeInput('Abandon.', 'abandon').correct).toBe(true)
  })

  it('乱答判错', () => {
    expect(judgeInput('xyzzy', 'abandon').correct).toBe(false)
    expect(judgeInput('随便写的', 'abandon').correct).toBe(false)
  })

  it('空输入必定判错', () => {
    expect(judgeInput('', 'abandon').correct).toBe(false)
    expect(judgeInput('   ', 'abandon').correct).toBe(false)
  })

  it('默写模式允许忽略词间空格', () => {
    expect(judgeInput('icecream', 'ice cream', false).correct).toBe(true)
  })

  it('听写模式 strict 下不允许忽略空格', () => {
    expect(judgeInput('icecream', 'ice cream', true).correct).toBe(false)
    expect(judgeInput('ice cream', 'ice cream', true).correct).toBe(true)
  })

  it('答案键始终为目标词', () => {
    expect(judgeInput('wrong', 'abandon').answerKey).toBe('abandon')
  })
})

describe('judgeChoice', () => {
  const options = ['abandon', 'ability', 'accelerate', 'abundant']

  it('选中目标词判对', () => {
    expect(judgeChoice('abandon', 'abandon', options).correct).toBe(true)
  })

  it('选中干扰项判错', () => {
    for (const w of ['ability', 'accelerate', 'abundant']) {
      expect(judgeChoice(w, 'abandon', options).correct).toBe(false)
    }
  })

  it('不在选项内的词判错（防越界）', () => {
    expect(judgeChoice('zzzz', 'abandon', options).correct).toBe(false)
  })

  it('忽略大小写', () => {
    expect(judgeChoice('Abandon', 'abandon', options).correct).toBe(true)
  })

  it('答案键始终为目标词', () => {
    expect(judgeChoice('ability', 'abandon', options).answerKey).toBe('abandon')
  })
})

describe('accuracyPercent', () => {
  it('正常情况计算正确', () => {
    expect(accuracyPercent(5, 10)).toBe(50)
    expect(accuracyPercent(10, 10)).toBe(100)
    expect(accuracyPercent(0, 10)).toBe(0)
  })

  it('未作答时为 0', () => {
    expect(accuracyPercent(0, 0)).toBe(0)
    expect(accuracyPercent(3, 0)).toBe(0)
  })

  it('正确数超过作答数时夹到 100（回归：曾出现 >100%）', () => {
    expect(accuracyPercent(11, 10)).toBe(100)
    expect(accuracyPercent(50, 10)).toBe(100)
  })

  it('非法输入不产生 NaN', () => {
    expect(accuracyPercent(NaN, 10)).toBe(0)
    expect(accuracyPercent(5, NaN)).toBe(0)
    expect(accuracyPercent(5, -1)).toBe(0)
  })

  it('结果恒在 0-100 区间', () => {
    for (let correct = 0; correct <= 12; correct++) {
      for (let answered = 0; answered <= 8; answered++) {
        const pct = accuracyPercent(correct, answered)
        expect(pct).toBeGreaterThanOrEqual(0)
        expect(pct).toBeLessThanOrEqual(100)
      }
    }
  })
})