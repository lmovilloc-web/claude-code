import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '../lib/types'
import { store } from '../lib/store'

interface AuthCtx {
  user: User | null
  login: (userId: string) => void
  logout: () => void
}

const Ctx = createContext<AuthCtx>({ user: null, login: () => {}, logout: () => {} })

const SESSION_KEY = 'ctruck-session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const id = localStorage.getItem(SESSION_KEY)
    return id ? store.get().users.find(u => u.id === id) ?? null : null
  })

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
  const logout = () => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
