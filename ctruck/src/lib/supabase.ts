import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Cliente Supabase, o null si no hay credenciales → la app corre en Modo Demo. */
export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null

export const isDemo = supabase === null
