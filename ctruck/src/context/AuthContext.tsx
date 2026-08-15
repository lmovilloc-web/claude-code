import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { User } from '../lib/types'
import { store } from '../lib/store'
import { supabase, isDemo } from '../lib/supabase'
import { pullAll, startSync } from '../lib/remote'

interface AuthCtx {
  user: User | null
  ready: boolean
  login: (userId: string) => void
  loginRemote: (email: string, password: string) => Promise<string | null>
  logout: () => void
}

const Ctx = createContext<AuthCtx>({
  user: null, ready: true, login: () => {}, loginRemote: async () => null, logout: () => {},
})

const SESSION_KEY = 'ctruck-session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (!isDemo) return null
    const id = localStorage.getItem(SESSION_KEY)
    return id ? store.get().users.find(u => u.id === id) ?? null : null
  })
  const [ready, setReady] = useState(isDemo)
  const stopSync = useRef<(() => void) | null>(null)

  // Modo Supabase: restaurar sesión guardada al abrir la app
  useEffect(() => {
    if (isDemo || !supabase) return
    supabase.auth.getSession().then(async ({ data }) => {
      const authId = data.session?.user?.id
      if (authId) {
        await pullAll().catch(() => {}) // sin señal: se usa el caché local
        const u = store.get().users.find(x => (x as User & { auth_id?: string }).auth_id === authId) ?? null
        setUser(u)
      }
      setReady(true)
    })
  }, [])

  // Sincronización continua mientras hay sesión
  useEffect(() => {
    stopSync.current?.()
    stopSync.current = user && !isDemo ? startSync(user.role) : null
    return () => { stopSync.current?.(); stopSync.current = null }
  }, [user?.id])

  useEffect(() =>
    store.subscribe(() => {
      setUser(prev => (prev ? store.get().users.find(u => u.id === prev.id) ?? null : null))
    }), [])

  const login = (userId: string) => {
    const u = store.get().users.find(u => u.id === userId) ?? null
    if (u) {
      localStorage.setItem(SESSION_KEY, u.id)
      setUser(u)
    }
  }

  const loginRemote = async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'Supabase no está configurado.'
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return 'Correo o contraseña incorrectos.'
    await pullAll().catch(() => {})
    const u = store.get().users.find(x => (x as User & { auth_id?: string }).auth_id === data.user.id) ?? null
    if (!u) return 'Tu cuenta no está vinculada a un perfil de CTruck. Avisa al administrador.'
    setUser(u)
    return null
  }

  const logout = () => {
    localStorage.removeItem(SESSION_KEY)
    if (supabase) supabase.auth.signOut()
    setUser(null)
  }

  return <Ctx.Provider value={{ user, ready, login, loginRemote, logout }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
