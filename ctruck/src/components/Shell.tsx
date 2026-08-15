// Truck OS · chrome del sistema: barra superior translúcida con logo y sesión
import { type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { isDemo } from '../lib/supabase'

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={`font-extrabold tracking-tight ${size === 'lg' ? 'text-4xl' : 'text-xl'}`}>
      C<span className="text-accent">TRUCK</span>
    </span>
  )
}

export default function Shell({ children, title }: { children: ReactNode; title?: string }) {
  const { user, logout } = useAuth()
  return (
    <div className="min-h-dvh">
      <header className="os-glass sticky top-0 z-40 border-b border-os-border">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="t-footnote hidden sm:inline">Truck OS 1.0</span>
            {isDemo && (
              <span className="rounded-full bg-info/15 text-info text-[11px] font-bold px-2.5 py-0.5 uppercase tracking-wider">
                Demo
              </span>
            )}
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-[14px] font-semibold leading-tight">{user.name}</div>
                <div className="t-footnote capitalize leading-tight">{roleLabel(user.role)}</div>
              </div>
              <button
                onClick={logout}
                className="os-t pressable rounded-full bg-os-card2 hairline px-4 py-1.5 text-[13px] font-semibold text-os-muted hover:text-os-text"
              >
                Salir
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24">
        {title && <h1 className="t-largetitle mb-6" style={{ textWrap: 'balance' }}>{title}</h1>}
        {children}
      </main>
    </div>
  )
}

export function roleLabel(role: string) {
  return { super_admin: 'Super Admin', admin: 'Administrador', supervisor: 'Supervisor', driver: 'Chofer', helper: 'Pioneta' }[role] ?? role
}
