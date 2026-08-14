// Pantalla de acceso Truck OS. En Modo Demo se elige el perfil;
// con Supabase conectado esta pantalla pasa a ser email + password.
import { useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { store } from '../lib/store'
import { Logo, roleLabel } from '../components/Shell'
import { Card } from '../components/ui'
import { isDemo } from '../lib/supabase'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const db = useSyncExternalStore(store.subscribe, store.get)
  const users = db.users.filter(u => u.active)

  const enter = (id: string) => {
    login(id)
    const u = db.users.find(x => x.id === id)!
    nav(u.role === 'admin' || u.role === 'supervisor' ? '/admin' : '/hoy', { replace: true })
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <Logo size="lg" />
          <p className="t-subhead mt-3">Truck OS 1.0 · Gestión de flota refrigerada</p>
          {isDemo && <p className="t-footnote mt-1">Modo demo — sin conexión a Supabase</p>}
        </div>
        <Card pad={false} className="overflow-hidden">
          {users.map((u, i) => (
            <button
              key={u.id}
              onClick={() => enter(u.id)}
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
        <p className="t-footnote text-center mt-6">CTruck · Control Truck</p>
      </div>
    </div>
  )
}
