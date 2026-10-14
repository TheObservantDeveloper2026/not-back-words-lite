/**
 * 设置页
 */
import { useEffect, useState } from 'react'
import { speak, waitVoices } from '@/core/speech'
import { clearAll, exportAll, importAll } from '@/core/storage'
import { updateSettings, useStore } from '@/store'

export function SettingsPage({ onResetDone }: { onResetDone: () => void }) {
  const settings = useStore((s) => s.settings)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [importMsg, setImportMsg] = useState('')

  useEffect(() => {
    void waitVoices().then(setVoices)
  }, [])

  const doExport = () => {
    const blob = new Blob([exportAll()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bbdict-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const doImport = async (file: File) => {
    const text = await file.text()
    const ok = importAll(text)
    setImportMsg(ok ? '导入成功，正在刷新…' : '导入失败：文件格式不正确')
    if (ok) setTimeout(() => window.location.reload(), 900)
  }

  const doReset = () => {
    if (!confirm('确定要清空所有学习记录吗？此操作不可撤销。\n建议先导出备份。')) return
    clearAll()
    onResetDone()
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 学习目标 */}
      <section className="card divide-y divide-slate-100 dark:divide-slate-800">
        <h3 className="px-5 pb-1 pt-5 text-sm font-semibold">学习目标</h3>

        <Row label="每日新词量" desc="每天新学的单词上限">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={settings.dailyNew}
              onChange={(e) => updateSettings({ dailyNew: Number(e.target.value) })}
              className="w-24 accent-brand-600"
            />
            <span className="w-10 text-right text-sm font-semibold tabular-nums">{settings.dailyNew}</span>
          </div>
        </Row>

        <Row label="每日复习上限" desc="每天复习的单词上限">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={20}
              max={300}
              step={10}
              value={settings.dailyReview}
              onChange={(e) => updateSettings({ dailyReview: Number(e.target.value) })}
              className="w-24 accent-brand-600"
            />
            <span className="w-10 text-right text-sm font-semibold tabular-nums">{settings.dailyReview}</span>
          </div>
        </Row>

        <Row label="自动发音" desc="进入题目时自动朗读单词">
          <Toggle
            checked={settings.autoSpeak}
            onChange={(v) => updateSettings({ autoSpeak: v })}
          />
        </Row>
      </section>

      {/* 发音 */}
      <section className="card divide-y divide-slate-100 dark:divide-slate-800">
        <h3 className="px-5 pb-1 pt-5 text-sm font-semibold">发音设置</h3>

        <Row label="发音音色" desc={voices.length === 0 ? '当前环境未检测到英语语音包' : `共 ${voices.length} 个可用音色`}>
          <select
            className="input max-w-40 py-2 text-sm"
            value={settings.voice}
            onChange={(e) => updateSettings({ voice: e.target.value })}
          >
            <option value="">系统默认</option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </Row>

        <Row label="语速" desc="听写模式建议放慢">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0.5}
              max={1.2}
              step={0.05}
              value={settings.rate}
              onChange={(e) => updateSettings({ rate: Number(e.target.value) })}
              className="w-24 accent-brand-600"
            />
            <button
              className="btn-ghost px-2 text-xs"
              onClick={() => speak('abandon', { voice: settings.voice, rate: settings.rate })}
            >
              试听
            </button>
          </div>
        </Row>
      </section>

      {/* 外观 */}
      <section className="card divide-y divide-slate-100 dark:divide-slate-800">
        <h3 className="px-5 pb-1 pt-5 text-sm font-semibold">外观</h3>
        <Row label="深色模式" desc="夜间学习更护眼">
          <Toggle
            checked={settings.theme === 'dark'}
            onChange={(v) => {
              updateSettings({ theme: v ? 'dark' : 'light' })
              document.documentElement.classList.toggle('dark', v)
            }}
          />
        </Row>
      </section>

      {/* 数据 */}
      <section className="card divide-y divide-slate-100 dark:divide-slate-800">
        <h3 className="px-5 pb-1 pt-5 text-sm font-semibold">数据管理</h3>

        <Row label="导出备份" desc="把学习进度导出为 JSON 文件">
          <button className="btn-outline py-2 text-xs" onClick={doExport}>
            导出
          </button>
        </Row>

        <Row label="导入备份" desc={importMsg || '从之前导出的文件恢复进度'}>
          <label className="btn-outline cursor-pointer py-2 text-xs">
            选择文件
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void doImport(f)
              }}
            />
          </label>
        </Row>

        <Row label="清空数据" desc="删除所有学习记录，自定义词库不受影响">
          <button className="btn-outline py-2 text-xs text-rose-500" onClick={doReset}>
            清空
          </button>
        </Row>
      </section>

      {/* 关于 */}
      <section className="card p-5">
        <h3 className="text-sm font-semibold">关于</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          本应用是一个开源的英语单词学习工具，借鉴了「不背单词」的产品思路，复习调度采用 SM-2
          算法。所有数据保存在本机浏览器中，不上传服务器。
        </p>
        <p className="mt-2 text-xs text-slate-400">
          词库数据来源：基于公开考试大纲词表整理 · 小学 / 中考 / 高考 / CET4 / CET6 / TOEFL / GRE
        </p>
      </section>
    </div>
  )
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</div>
        {desc && <div className="mt-0.5 truncate text-[11px] text-slate-400">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
