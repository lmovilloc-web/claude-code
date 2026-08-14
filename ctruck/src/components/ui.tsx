// Truck OS · componentes base (tratamiento Apple: pills, hairlines, blur)
import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'

export function Button({
  variant = 'primary', full, className = '', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'; full?: boolean }) {
  const base = 'os-t pressable rounded-full font-semibold text-[17px] px-6 py-3.5 disabled:opacity-40 disabled:pointer-events-none'
  const variants = {
    primary: 'bg-accent text-white shadow-os-accent hover:brightness-110',
    secondary: 'bg-os-card2 text-os-text hairline hover:bg-[#18293c]',
    ghost: 'text-accent hover:bg-accent/10',
    destructive: 'bg-danger text-white hover:brightness-110',
  }
  return <button className={`${base} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`} {...props} />
}

export function Card({ children, className = '', pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <div className={`bg-os-card rounded-os-lg hairline shadow-os ${pad ? 'p-5' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted'; children: ReactNode }) {
  const tones = {
    ok: 'bg-ok/15 text-ok', warn: 'bg-warn/15 text-warn', danger: 'bg-danger/15 text-danger',
    info: 'bg-info/15 text-info', muted: 'bg-os-card2 text-os-muted',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Dot({ tone }: { tone: 'ok' | 'warn' | 'danger' | 'muted' }) {
  const tones = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', muted: 'bg-os-muted' }
  return <span className={`inline-block w-2 h-2 rounded-full ${tones[tone]}`} />
}

export function Progress({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'ok' | 'warn' | 'danger' }) {
  const tones = { accent: 'bg-accent', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger' }
  return (
    <div className="h-1.5 rounded-full bg-os-card2 overflow-hidden">
      <div className={`h-full rounded-full os-t ${tones[tone]}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export function Field({
  label, hint, className = '', ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className="block">
      {label && <span className="t-caption block mb-2">{label}</span>}
      <input
        className={`w-full bg-os-card2 hairline rounded-os px-4 py-3.5 text-[17px] text-os-text placeholder:text-os-muted/60 outline-none focus:ring-2 focus:ring-accent/60 os-t ${className}`}
        {...props}
      />
      {hint && <span className="t-footnote block mt-1.5">{hint}</span>}
    </label>
  )
}

export function Segmented<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full bg-os-card2 p-1 hairline overflow-x-auto max-w-full">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`os-t whitespace-nowrap rounded-full px-4 py-1.5 text-[14px] font-semibold ${
            value === o.value ? 'bg-accent text-white shadow-os-accent' : 'text-os-muted hover:text-os-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: 'ok' | 'warn' | 'danger' | 'info'; sub?: string }) {
  const tones = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger', info: 'text-info' }
  return (
    <Card className="min-w-0">
      <div className="t-caption mb-1">{label}</div>
      <div className={`text-[26px] font-extrabold tnum tracking-tight ${tone ? tones[tone] : ''}`}>{value}</div>
      {sub && <div className="t-footnote mt-0.5">{sub}</div>}
    </Card>
  )
}

export function Empty({ icon = '○', title, sub }: { icon?: string; title: string; sub?: string }) {
  return (
    <div className="text-center py-14">
      <div className="text-3xl mb-3 opacity-40">{icon}</div>
      <div className="t-headline">{title}</div>
      {sub && <div className="t-subhead mt-1">{sub}</div>}
    </div>
  )
}
