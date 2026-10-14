/**
 * 发音（Web Speech API）
 * 听写模式依赖浏览器/系统 TTS，不依赖网络词典 API。
 */

/** 列出可用的英语语音 */
export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  return speechSynthesis.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang))
}

/** 等待语音列表加载完成（部分浏览器是异步的） */
export function waitVoices(timeout = 2000): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') return resolve([])
    const existing = listVoices()
    if (existing.length > 0) return resolve(existing)

    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve(listVoices())
    }
    speechSynthesis.addEventListener('voiceschanged', finish, { once: true })
    setTimeout(finish, timeout)
  })
}

/** 朗读一个单词或句子 */
export function speak(
  text: string,
  opts: { voice?: string; rate?: number; onEnd?: () => void } = {},
): void {
  if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
    opts.onEnd?.()
    return
  }
  // 打断上一次朗读，避免堆积
  speechSynthesis.cancel()

  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = opts.rate ?? 0.9
  const voices = listVoices()
  const picked = opts.voice ? voices.find((v) => v.name === opts.voice) : voices[0]
  if (picked) u.voice = picked
  if (opts.onEnd) {
    u.onend = () => opts.onEnd?.()
    u.onerror = () => opts.onEnd?.()
  }
  speechSynthesis.speak(u)
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

/**
 * 判断用户输入是否匹配目标单词
 * 规则：忽略大小写、首尾空格、中英文标点、重复空格
 * @param strict 为 true 时要求完全一致（默写模式）
 */
export function checkSpelling(input: string, target: string, strict = false): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[.,!?;:'"()[\]{}·]/g, '')
      .replace(/\s+/g, ' ')

  const a = norm(input)
  const b = norm(target)
  if (!a) return false
  if (strict) return a === b

  // 宽松：忽略词与词之间的空格差异（如 "ice cream" vs "icecream"）
  if (a === b) return true
  return a.replace(/\s/g, '') === b.replace(/\s/g, '')
}

/**
 * 中文释义判分（汉译英/英译汉的翻译题）
 * 采用宽松包含匹配：命中关键义项即算对
 */
export function checkChinese(input: string, definitions: [string, string][]): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\s，。、；：？！,.;:?!（）()【】\[\]"\u201c\u201d]/g, '')

  const a = norm(input)
  if (!a) return false

  const senses = definitions.map(([, cn]) => norm(cn)).filter(Boolean)
  if (senses.length === 0) return false

  // 输入包含某个义项，或某个义项包含输入
  return senses.some((s) => a.includes(s) || s.includes(a))
}