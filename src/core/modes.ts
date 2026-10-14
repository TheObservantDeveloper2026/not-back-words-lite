/**
 * 练习模式定义
 */

export type PracticeMode = 'en2cn' | 'cn2en' | 'spell' | 'listen'

export interface ModeMeta {
  id: PracticeMode
  name: string
  shortName: string
  desc: string
  /** 图标（emoji，避免额外依赖） */
  icon: string
  /** 是否需要键盘输入 */
  input: boolean
  /** 是否需要发音 */
  needAudio: boolean
  /**
   * 题目方向：
   *  - en2cn: 给英文，选/写中文
   *  - cn2en: 给中文，写英文
   *  - spell:  给释义，全拼写单词（默写）
   *  - listen: 只播放发音，拼写单词（听写）
   */
  hint: string
}

export const MODES: Record<PracticeMode, ModeMeta> = {
  en2cn: {
    id: 'en2cn',
    name: '英译汉',
    shortName: '英译汉',
    desc: '看英文单词，选出正确的中文意思',
    icon: '\u{1F310}',
    input: false,
    needAudio: false,
    hint: '选出下列单词的中文释义',
  },
  cn2en: {
    id: 'cn2en',
    name: '汉译英',
    shortName: '汉译英',
    desc: '看中文释义，拼写出对应的英文单词',
    icon: '\u270D\uFE0F',
    input: true,
    needAudio: false,
    hint: '根据中文释义拼写英文单词',
  },
  spell: {
    id: 'spell',
    name: '默写',
    shortName: '默写',
    desc: '看释义和首字母提示，完整拼写单词',
    icon: '\u270D',
    input: true,
    needAudio: false,
    hint: '根据释义和首字母提示默写单词',
  },
  listen: {
    id: 'listen',
    name: '听写',
    shortName: '听写',
    desc: '只听发音，拼写出听到的单词',
    icon: '\u{1F3A7}',
    input: true,
    needAudio: true,
    hint: '听发音，拼写单词',
  },
}

export const MODE_LIST = Object.values(MODES)

/**
 * 生成英译汉的选择题选项
 * 从同一词书里取干扰项（优先同词性，考察辨析）
 */
export function buildChoices<T extends { word: string; definitions: [string, string][] }>(
  target: T,
  pool: T[],
  count = 4,
  random: () => number = Math.random,
): T[] {
  const targetPos = target.definitions[0]?.[0] ?? ''
  const samePos = pool.filter(
    (w) =>
      w.word !== target.word &&
      (w.definitions[0]?.[0] ?? '') === targetPos &&
      targetPos !== '',
  )
  const others = pool.filter(
    (w) => w.word !== target.word && (w.definitions[0]?.[0] ?? '') !== targetPos,
  )

  const picked: T[] = []
  const takeSame = Math.min(samePos.length, Math.max(1, count - 2))
  picked.push(...shuffle(samePos, random).slice(0, takeSame))
  picked.push(...shuffle(others, random).slice(0, count - 1 - picked.length))

  return shuffle([target, ...picked], random)
}

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 生成默写提示：首字母 + 长度 */
export function spellHint(word: string): string {
  return `${word[0]}${'\u00B7'.repeat(Math.max(word.length - 1, 1))}  (${word.length})`
}