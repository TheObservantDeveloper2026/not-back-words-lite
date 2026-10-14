/**
 * 通用 UI 组件
 */
import type { ReactNode } from 'react'

/** 环形进度 */
export function Ring({
  value,
  size = 72,
  stroke = 6,
  color = '#3385f6',
  track = 'rgba(148,163,184,0.25)',
  children,
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.min(1, Math.max(0, value))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

/** 线性进度条 */
export function Bar({ value, className = '', color = 'bg-brand-500' }: { value: number; className?: string; color?: string }) {
  const pct = Math.min(100, Math.max(0, value * 100))
  return (
    <div className={`h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${color} transition-[width] duration-700 ease-out`} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** 统计数字块 */
export function StatTile({
  label,
  value,
  unit,
  accent = 'text-slate-900 dark:text-slate-100',
}: {
  label: string
  value: ReactNode
  unit?: string
  accent?: string
}) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accent}`}>
        {value}
        {unit && <span className="ml-0.5 text-xs font-medium text-slate-400">{unit}</span>}
      </div>
    </div>
  )
}

/** 空状态 */
export function Empty({ icon = '\u{1F4DA}', title, desc, action }: { icon?: string; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      <div className="mb-3 text-4xl opacity-60">{icon}</div>
      <div className="text-base font-medium text-slate-700 dark:text-slate-200">{title}</div>
      {desc && <div className="mt-1 max-w-xs text-sm text-slate-400">{desc}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** 徽标 */
export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'brand' | 'emerald' | 'amber' | 'rose' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  }
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}