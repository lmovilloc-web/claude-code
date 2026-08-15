// Acceso Truck OS.
// Con Supabase conectado: correo + contraseña. En Modo Demo: selector de perfil.
import { useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { store } from '../lib/store'
import { Logo, roleLabel } from '../components/Shell'
import { Button, Card, Field } from '../components/ui'
import { isDemo } from '../lib/supabase'

export default function Login() {
  const { login, loginRemote, user, ready } = useAuth()
  const nav = useNavigate()
  const db = useSyncExternalStore(store.subscribe, store.get)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const goHome = (role: string) =>
    nav(role === 'admin' || role === 'supervisor' ? '/admin' : '/hoy', { replace: true })

  if (!isDemo && ready && user) {
    goHome(user.role)
    return null
  }

  const enterDemo = (id: string) => {
    login(id)
    const u = db.users.find(x => x.id === id)!
    goHome(u.role)
  }

  const submitRemote = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await loginRemote(email.trim().toLowerCase(), password)
    setBusy(false)
    if (err) { setError(err); return }
    const u = store.get().users.find(x => x.email === email.trim().toLowerCase())
    goHome(u?.role ?? 'driver')
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <Logo size="lg" />
          <p className="t-subhead mt-3">Truck OS 1.0 · Gestión de flota refrigerada</p>
          {isDemo && <p className="t-footnote mt-1">Modo demo — sin conexión a Supabase</p>}
        </div>

        {isDemo ? (
          <Card pad={false} className="overflow-hidden">
            {db.users.filter(u => u.active).map((u, i) => (
              <button
                key={u.id}
                onClick={() => enterDemo(u.id)}
                className={`os-t w-full flex items-center justify-between px-5 py-4 text-left hover:bg-os-card2 ${
                  i > 0 ? 'border-t border-os-border' : ''
                }`}
              >
                <div>
                  <div className="t-headline">{u.name}</div>
                  <div className="t-footnote">{roleLabel(u.role)}{u.truck_id ? ` · ${db.trucks.find(t => t.id === u.truck_id)?.code}` : ''}</div>
                </div>
                <span className="text-os-muted">›</span>
              </button>
            ))}
          </Card>
        ) : !ready ? (
          <Card className="text-center py-10"><span className="t-subhead">Conectando…</span></Card>
        ) : (
          <form onSubmit={submitRemote}>
            <Card className="space-y-4">
              <Field label="Correo" type="email" autoComplete="email" placeholder="nombre@ctruck.cl"
                value={email} onChange={e => setEmail(e.target.value)} autoFocus />
              <Field label="Contraseña" type="password" autoComplete="current-password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} />
              {error && (
                <div className="rounded-os bg-danger/10 hairline px-4 py-3 text-[14px] text-danger font-medium">{error}</div>
              )}
              <Button full type="submit" disabled={busy || !email || !password}>
                {busy ? 'Entrando…' : 'Entrar'}
              </Button>
            </Card>
          </form>
        )}
        <p className="t-footnote text-center mt-6">CTruck · Control Truck</p>
      </div>
    </div>
  )
}
