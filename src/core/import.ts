/**
 * 自定义词库解析：支持多种常见格式
 *
 *  支持的输入格式（每行一条）：
 *    word                 仅单词（无释义，可用于听写练习）
 *    word 释义
 *    word\t释义
 *    word,释义
 *    word [音标] 词性.释义
 *    word | 释义 | 音标
 *    word<TAB>释义<TAB>音标
 *    tab: word<TAB>释义   （Excel / CSV 两列）
 *
 *  另外支持整段 JSON（[{"word":"x","definitions":[["n.","释义"]]}] 或
 *  {"word":"x","mean":"释义"} 格式）。
 */
import type { PartOfSpeech, Sense } from '@/data/types'
import type { Word } from '@/data/books'
import { makeWord } from '@/data/books'

// 词性标记：长的排前面，避免 "adj." 被 "a" 抢先匹配
const POS_TOKENS = 'adj|adv|prep|conj|pron|num|art|int|vt|vi|aux|n|v|a|ad'

export interface ParseResult {
  words: Word[]
  skipped: number
}

/** 解析纯文本词表 */
export function parseWordlist(text: string, book: string, fallbackFreq = 3): ParseResult {
  const trimmed = text.trim()
  if (!trimmed) return { words: [], skipped: 0 }

  // 尝试 JSON
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const json = parseJson(trimmed, book, fallbackFreq)
    if (json) return json
  }

  const lines = trimmed.split(/\r?\n/)
  const words: Word[] = []
  const seen = new Set<string>()
  let skipped = 0

  for (const raw of lines) {
    let line = raw.trim()
    if (!line) continue
    // 跳过标题行和分隔线
    if (/^[=\-*\s]{3,}$/.test(line)) continue
    if (/^#+/.test(line)) continue

    // CSV 行：整行被引号包裹，或以引号字段开头
    if (line.startsWith('"')) {
      const parsed = parseCsvLine(line)
      if (parsed) {
        const w = makeWord(
          {
            word: parsed.word,
            phonetic: parsed.ipa ? `/${parsed.ipa}/` : '',
            freq: fallbackFreq,
            definitions: parseSenses(parsed.mean),
          },
          book,
        )
        const key = w.word.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          words.push(w)
        } else skipped += 1
        continue
      }
    }

    const w = parseLine(line, book, fallbackFreq)
    if (!w) {
      skipped += 1
      continue
    }
    const key = w.word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    words.push(w)
  }

  return { words, skipped }
}

/** 解析一行 CSV：word,phonetic,meaning（字段可带引号） */
function parseCsvLine(line: string): { word: string; ipa: string; mean: string } | null {
  // 支持双引号包裹的字段；未包裹字段用逗号分隔
  const fields: string[] = []
  let cur = ''
  let inQuote = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else inQuote = false
      } else cur += ch
    } else if (ch === '"') {
      inQuote = true
    } else if (ch === ',') {
      fields.push(cur)
      cur = ''
    } else cur += ch
  }
  fields.push(cur)

  const [word, ipa, mean] = fields.map((s) => s.trim())
  if (!word || !/^[A-Za-z]/.test(word)) return null
  return { word, ipa: ipa ?? '', mean: mean ?? '' }
}

/** 解析单行 */
function parseLine(line: string, book: string, freq: number): Word | null {
  // 英文单词合法性：字母开头，允许连字符、撇号、以及单词内部的空格（ice cream）
  // 注意不能允许尾随空格，否则 "world 世界" 会被整体当成一个单词。
  // 这里不能在函数入口做校验——整行通常还包含中文释义，
  // 必须由各个格式分支各自提取出 word 后再校验。
  const isWord = (s: string) => /^[A-Za-z][A-Za-z'\-]*(?: [A-Za-z'\-]+)*$/.test(s.trim())

  // 整行必须以英文字母开头，否则不是单词表
  if (!/^[A-Za-z]/.test(line)) return null

  // 1) 管道分隔: word | 释义 | 音标
  if (line.includes('|')) {
    const parts = line.split('|').map((s) => s.trim())
    const [word, mean, ipa] = parts
    if (isWord(word)) {
      return build(word, mean, ipa, freq, book)
    }
    return null
  }

  // 2) 方括号音标: word [ipa] 词性.释义
  const bracket = line.match(/^([A-Za-z][A-Za-z'\- ]*?)\s*\[([^\]]+)\]\s*(.*)$/)
  if (bracket) {
    const [, word, ipa, rest] = bracket
    const defs = parseSenses(rest)
    return makeWord(
      {
        word: word.trim(),
        phonetic: `/${ipa.trim().replace(/^\/|\/$/g, '')}/`,
        freq,
        definitions: defs,
      },
      book,
    )
  }

  // 3) 制表符: word<TAB>释义 或 word<TAB>释义<TAB>音标
  if (line.includes('\t')) {
    const parts = line.split('\t').map((s) => s.trim())
    const [word, mean, ipa] = parts
    if (isWord(word)) return build(word, mean, ipa, freq, book)
    // 也可能是 释义<TAB>单词
    if (parts.length >= 2 && isWord(parts[1])) {
      return build(parts[1], parts[0], undefined, freq, book)
    }
    return null
  }

  // 4) 逗号分隔: word,释义  （释义里可能有逗号，取第一个逗号）
  const comma = line.indexOf(',')
  const cnComma = line.indexOf('，')
  const idx = comma >= 0 ? comma : cnComma
  if (idx > 0) {
    const word = line.slice(0, idx).trim()
    const mean = line.slice(idx + 1).trim()
    if (isWord(word) && mean) return build(word, mean, undefined, freq, book)
  }

  // 5) 多空格分隔: word   释义（词本身可能含空格，贪婪匹配整段）
  const multi = line.match(/^([A-Za-z][A-Za-z'\-]*(?: [A-Za-z'\-]+)*?)\s{2,}(\S.*)$/)
  if (multi) {
    const [, word, mean] = multi
    if (isWord(word)) return build(word, mean.trim(), undefined, freq, book)
  }

  // 6) 单空格 + 带词性标记的释义: "good adj. 好的" / "ice cream n. 冰淇淋"
  //    词性标记按长的优先匹配（adj 在 a 之前），避免 "adj." 被拆成 "a" + "dj."
  const single = line.match(
    /^([A-Za-z][A-Za-z'\-]*(?: [A-Za-z'\-]+)*?)\s+((?:adj|adv|prep|conj|pron|num|art|int|vt|vi|aux|n|v|a|ad)\.\s*\S.*)$/i,
  )
  if (single) {
    const [, word, mean] = single
    if (isWord(word)) return build(word, mean.trim(), undefined, freq, book)
  }

  // 7) 单空格 + 中文释义（无词性标记）: world 世界
  const cnSingle = line.match(/^([A-Za-z][A-Za-z'\-]*(?: [A-Za-z'\-]+)*?)\s+([\u4e00-\u9fff].*)$/)
  if (cnSingle) {
    const [, word, mean] = cnSingle
    if (isWord(word)) return build(word, mean.trim(), undefined, freq, book)
  }

  // 8) 单空格 + 英文释义: abandon give up
  const enSingle = line.match(/^([A-Za-z][A-Za-z'\-]+)\s+([a-z][A-Za-z\s,.'-]*)$/)
  if (enSingle) {
    const [, word, mean] = enSingle
    if (isWord(word) && mean.length >= 3) {
      return build(word, mean.trim(), undefined, freq, book)
    }
  }

  // 9) 纯单词
  if (isWord(line)) {
    return makeWord({ word: line.trim(), freq, definitions: [] }, book)
  }

  return null
}

function build(word: string, mean: string | undefined, ipa: string | undefined, freq: number, book: string): Word {
  const defs = mean ? parseSenses(mean) : []
  const cleanedIpa = ipa ? ipa.trim().replace(/^\/|\/$/g, '') : ''
  return makeWord(
    {
      word: word.trim(),
      phonetic: cleanedIpa ? `/${cleanedIpa}/` : '',
      freq,
      definitions: defs,
    },
    book,
  )
}

/** 从混合文本里提取词性与释义 */
function parseSenses(raw: string): Sense[] {
  if (!raw) return []
  const text = raw.trim()

  // 找到所有词性标记的位置："n. 能力" 或 "vt. 放弃 n. 放任"
  const matches = [...text.matchAll(new RegExp(`(?:^|[\\s\\uff1b;,])\\**(${POS_TOKENS})\\.\\s*`, 'gi'))]
  if (matches.length === 0) {
    // 无词性标记：按分号/逗号切分义项
    const parts = text
      .split(/[；;]/)
      .map((s) => s.trim())
      .filter(Boolean)
    // 没有分号时再按逗号切，最多 3 条
    const chunks = parts.length > 1 ? parts : text.split(/[，,]/).map((s) => s.trim()).filter(Boolean)
    return chunks.slice(0, 3).map((p) => ['', p] as Sense)
  }

  const out: Sense[] = []
  for (let i = 0; i < matches.length; i++) {
    const pos = normPos(matches[i][1])
    const start = (matches[i].index ?? 0) + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length
    const body = text.slice(start, end).trim()
    if (!body) continue

    // 同一词性下的多义项（用分号分隔）拆成多条
    const parts = body
      .split(/[；;]/)
      .map((s) => s.trim())
      .filter(Boolean)
    for (const p of parts) out.push([pos, p])
  }
  return out.slice(0, 4)
}

function normPos(tok: string): PartOfSpeech | '' {
  const map: Record<string, PartOfSpeech> = {
    art: 'art.', n: 'n.', v: 'v.', vt: 'v.', vi: 'v.', a: 'adj.', adj: 'adj.',
    ad: 'adv.', adv: 'adv.', prep: 'prep.', conj: 'conj.', pron: 'pron.', num: 'num.', int: 'int.',
  }
  return map[tok.toLowerCase()] ?? ''
}

/** 解析 JSON 词表 */
function parseJson(text: string, book: string, freq: number): ParseResult | null {
  try {
    const data = JSON.parse(text)
    const arr = Array.isArray(data) ? data : Array.isArray(data?.words) ? data.words : null
    if (!arr) return null

    const words: Word[] = []
    const seen = new Set<string>()
    let skipped = 0

    for (const item of arr) {
      if (typeof item === 'string') {
        const w = parseLine(item, book, freq)
        if (w && !seen.has(w.word.toLowerCase())) {
          seen.add(w.word.toLowerCase())
          words.push(w)
        } else if (!w) skipped += 1
        continue
      }

      if (!item || typeof item !== 'object') {
        skipped += 1
        continue
      }

      const word = String(item.word ?? item.w ?? item.headword ?? item.term ?? '').trim()
      if (!word || !/^[A-Za-z]/.test(word)) {
        skipped += 1
        continue
      }

      let defs: Sense[] = []
      if (Array.isArray(item.definitions)) {
        defs = item.definitions
          .map((d: unknown) => {
            if (Array.isArray(d)) return [String(d[0] ?? ''), String(d[1] ?? '')] as Sense
            if (d && typeof d === 'object') {
              const o = d as Record<string, unknown>
              return [String(o.pos ?? o.partOfSpeech ?? ''), String(o.cn ?? o.meaning ?? o.definition ?? '')] as Sense
            }
            return null
          })
          .filter(Boolean) as Sense[]
      }

      if (defs.length === 0) {
        const mean = item.mean ?? item.meaning ?? item.cn ?? item.translation ?? item.trans ?? item.definition
        if (typeof mean === 'string') defs = parseSenses(mean)
        else if (Array.isArray(mean)) defs = mean.map((m) => ['', String(m)] as Sense)
      }

      const key = word.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      const ipaRaw = String(item.phonetic ?? item.ipa ?? item.phonetics ?? '').trim().replace(/^\/|\/$/g, '')
      words.push(
        makeWord(
          {
            word,
            phonetic: ipaRaw ? `/${ipaRaw}/` : '',
            freq: Number(item.freq ?? item.frequency ?? freq) || freq,
            definitions: defs,
            tip: item.tip ?? item.note ?? undefined,
          },
          book,
        ),
      )
    }

    return { words, skipped }
  } catch {
    return null
  }
}

/** 导出为 CSV（用于备份/分享） */
export function toCSV(words: Word[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const rows = words.map((w) =>
    [
      esc(w.word),
      esc(w.phonetic.replace(/^\/|\/$/g, '')),
      esc(w.definitions.map(([pos, cn]) => `${pos}${cn}`).join('; ')),
    ].join(','),
  )
  return ['word,phonetic,meaning', ...rows].join('\n')
}