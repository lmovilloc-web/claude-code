// Capa remota Supabase: pull inicial, push incremental (offline-first),
// Realtime y notificaciones del navegador para admin/supervisor.
//
// Diseño: el store local (localStorage) sigue siendo la fuente que lee la UI
// — por eso la app funciona sin señal. Esta capa lo hidrata desde Supabase
// al iniciar sesión, empuja los cambios locales (diff por id, con reintento
// al recuperar conexión) y aplica los eventos Realtime de otros equipos.

import { supabase } from './supabase'
import { store, type DB } from './store'
import type { Role } from './types'

// Columnas reales de cada tabla sincronizable (evita mandar campos locales)
const SYNC_TABLES: Record<string, string[]> = {
  trucks: ['id', 'code', 'plate', 'current_km', 'next_maintenance_km', 'status'],
  daily_checkins: ['id', 'user_id', 'truck_id', 'date', 'role', 'aptitude_result', 'aptitude_answers',
    'km_in', 'km_system', 'km_diff', 'km_warning', 'dashboard_photo_url', 'cabin_photo_url',
    'signature_name', 'checkout_km', 'checkout_diff', 'checkout_warning', 'checkin_time', 'checkout_time'],
  route_assignments: ['id', 'route_id', 'truck_id', 'driver_id', 'date', 'status'],
  cargo_receptions: ['id', 'route_assignment_id', 'reported_by', 'invoice_number', 'dispatcher_name',
    'route_confirmed', 'photo_urls', 'timestamp'],
  delivery_records: ['id', 'stop_id', 'reported_by', 'recipient_name', 'recipient_rut',
    'has_issue', 'issue_type', 'notes', 'timestamp'],
  stop_visits: ['id', 'stop_id', 'arrived_at', 'departed_at', 'reported_by'],
  km_warnings: ['id', 'truck_id', 'driver_id', 'warning_type', 'km_diff', 'acknowledged', 'created_at'],
  maintenance_alerts: ['id', 'truck_id', 'alert_type', 'km_remaining', 'acknowledged'],
  expenses: ['id', 'truck_id', 'category', 'amount_clp', 'expense_date', 'description'],
}

const READ_TABLES = ['trucks', 'users', 'routes', 'route_assignments', 'delivery_stops',
  'daily_checkins', 'cargo_receptions', 'delivery_records', 'stop_visits',
  'km_warnings', 'maintenance_alerts', 'expenses'] as const

const SNAP_KEY = 'ctruck-sync-snapshot'

let snapshot: Record<string, Record<string, string>> = {}
let syncTimer: ReturnType<typeof setTimeout> | null = null
let myRole: Role | null = null

function loadSnapshot() {
  try { snapshot = JSON.parse(localStorage.getItem(SNAP_KEY) ?? '{}') } catch { snapshot = {} }
}
function saveSnapshot() { localStorage.setItem(SNAP_KEY, JSON.stringify(snapshot)) }

function pick(row: Record<string, unknown>, cols: string[]) {
  const out: Record<string, unknown> = {}
  for (const c of cols) if (c in row) out[c] = row[c]
  return out
}

/** Descarga todo lo visible según RLS y reemplaza el store local. */
export async function pullAll(): Promise<void> {
  if (!supabase) return
  const results = await Promise.all(READ_TABLES.map(t => supabase!.from(t).select('*')))
  const db = { ...store.get() } as DB & Record<string, unknown>
  READ_TABLES.forEach((t, i) => {
    const { data, error } = results[i]
    if (!error && data) (db as Record<string, unknown>)[t] = data
  })
  // users: normalizar campos opcionales
  db.users = (db.users ?? []).map(u => ({ ...u, active: u.active ?? true }))
  store.replaceAll(db as DB)
  // snapshot = estado remoto conocido
  snapshot = {}
  for (const t of Object.keys(SYNC_TABLES)) {
    snapshot[t] = {}
    for (const row of (db as unknown as Record<string, { id: string }[]>)[t] ?? []) {
      snapshot[t][row.id] = JSON.stringify(pick(row as unknown as Record<string, unknown>, SYNC_TABLES[t]))
    }
  }
  saveSnapshot()
}

/** Empuja al servidor los cambios locales pendientes (upserts + deletes). */
export async function syncUp(): Promise<void> {
  if (!supabase) return
  const db = store.get() as unknown as Record<string, Record<string, unknown>[]>
  for (const [table, cols] of Object.entries(SYNC_TABLES)) {
    const rows = db[table] ?? []
    const prev = snapshot[table] ?? {}
    // Filas nuevas → insert; existentes modificadas → update.
    // (RLS permite a los choferes actualizar trucks/route_assignments pero no insertarlos.)
    const inserts: Record<string, unknown>[] = []
    const updates: Record<string, unknown>[] = []
    const currentIds = new Set<string>()
    for (const row of rows) {
      const id = row.id as string
      currentIds.add(id)
      const j = JSON.stringify(pick(row, cols))
      if (prev[id] === j) continue
      ;(id in prev ? updates : inserts).push(pick(row, cols))
    }
    const deleted = Object.keys(prev).filter(id => !currentIds.has(id))
    if (inserts.length) {
      const { error } = await supabase.from(table).insert(inserts)
      if (error) console.warn(`[sync] insert ${table}:`, error.message) // reintenta en el próximo ciclo
      else for (const r of inserts) prev[r.id as string] = JSON.stringify(r)
    }
    for (const r of updates) {
      const { error } = await supabase.from(table).update(r).eq('id', r.id as string)
      if (error) console.warn(`[sync] update ${table}:`, error.message)
      else prev[r.id as string] = JSON.stringify(r)
    }
    if (deleted.length) {
      const { error } = await supabase.from(table).delete().in('id', deleted)
      if (!error) for (const id of deleted) delete prev[id]
    }
    snapshot[table] = prev
  }
  saveSnapshot()
}

function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => { syncUp() }, 600)
}

function notify(body: string) {
  if (!myRole || !['super_admin', 'admin', 'supervisor'].includes(myRole)) return
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification('CTruck · Alerta', { body })
  }
}

/** Suscripción Realtime: merge de filas remotas + notificaciones al panel. */
export function startRealtime(): () => void {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('ctruck-db')
    .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
      const table = payload.table
      const row = (payload.new ?? payload.old) as Record<string, unknown> & { id: string }
      if (!row?.id) return
      // merge en el store sin re-disparar sync (actualizamos snapshot a la par)
      store.mutate(d => {
        const coll = (d as unknown as Record<string, { id: string }[]>)[table]
        if (!coll) return
        const idx = coll.findIndex(r => r.id === row.id)
        if (payload.eventType === 'DELETE') { if (idx >= 0) coll.splice(idx, 1) }
        else if (idx >= 0) coll[idx] = { ...coll[idx], ...row }
        else coll.push(row as never)
      })
      if (SYNC_TABLES[table]) {
        snapshot[table] ??= {}
        if (payload.eventType === 'DELETE') delete snapshot[table][row.id]
        else snapshot[table][row.id] = JSON.stringify(pick(row, SYNC_TABLES[table]))
        saveSnapshot()
      }
      // Notificaciones al panel (solo eventos de otros dispositivos)
      if (payload.eventType === 'INSERT') {
        const d = store.get()
        const name = (id: unknown) => d.users.find(u => u.id === id)?.name ?? 'Alguien'
        const truck = (id: unknown) => d.trucks.find(t => t.id === id)?.code ?? 'Camión'
        if (table === 'daily_checkins' && row.aptitude_result === 'no_apto')
          notify(`${name(row.user_id)} marcó NO APTO en su declaración de aptitud.`)
        if (table === 'km_warnings')
          notify(`${truck(row.truck_id)}: aviso de kilometraje (${row.warning_type === 'checkin_discrepancy' ? 'discrepancia en check-in' : 'exceso en check-out'}).`)
        if (table === 'maintenance_alerts' && row.alert_type === 'red_1000')
          notify(`🔴 ${truck(row.truck_id)}: mantención urgente, quedan ${row.km_remaining} km.`)
        if (table === 'delivery_records' && row.has_issue)
          notify(`Incidente en entrega: ${row.issue_type ?? 'sin tipo'} (${name(row.reported_by)}).`)
        if (table === 'cargo_receptions')
          notify(`Recepción de carga registrada por ${name(row.reported_by)} · factura ${row.invoice_number}.`)
      }
    })
    .subscribe()
  return () => { supabase!.removeChannel(channel) }
}

/** Arranca la sincronización continua. Devuelve una función de limpieza. */
export function startSync(role: Role): () => void {
  if (!supabase) return () => {}
  myRole = role
  loadSnapshot()
  const unsubStore = store.subscribe(scheduleSync)
  const stopRealtime = startRealtime()
  const onOnline = () => syncUp()
  window.addEventListener('online', onOnline)
  syncUp() // drena lo pendiente de sesiones offline
  if (['super_admin', 'admin', 'supervisor'].includes(role) &&
      typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission()
  }
  return () => {
    unsubStore()
    stopRealtime()
    window.removeEventListener('online', onOnline)
  }
}

/** Sube fotos dataURL al bucket y devuelve rutas de Storage (o el dataURL si falla/offline). */
export async function maybeUploadPhotos(bucket: string, dataUrls: string[]): Promise<string[]> {
  if (!supabase) return dataUrls
  const out: string[] = []
  for (const url of dataUrls) {
    if (!url.startsWith('data:')) { out.push(url); continue }
    try {
      const blob = await (await fetch(url)).blob()
      const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg' })
      out.push(error ? url : `${bucket}/${path}`)
    } catch {
      out.push(url) // sin señal: se conserva la dataURL local
    }
  }
  return out
}
