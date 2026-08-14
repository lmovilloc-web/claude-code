// Capa de datos de CTruck.
// En Modo Demo persiste en localStorage con datos seed realistas;
// la misma interfaz se implementará contra Supabase al conectar credenciales.

import type {
  Truck, User, DailyCheckin, Route, RouteAssignment, DeliveryStop,
  DeliveryRecord, StopVisit, MaintenanceAlert, KmWarning, Expense,
} from './types'
import { hoy } from './format'

const KEY = 'ctruck-demo-v1'
const uid = () => crypto.randomUUID()

export interface DB {
  trucks: Truck[]
  users: User[]
  daily_checkins: DailyCheckin[]
  routes: Route[]
  route_assignments: RouteAssignment[]
  delivery_stops: DeliveryStop[]
  delivery_records: DeliveryRecord[]
  stop_visits: StopVisit[]
  maintenance_alerts: MaintenanceAlert[]
  km_warnings: KmWarning[]
  expenses: Expense[]
}

function seed(): DB {
  const trucks: Truck[] = [
    { id: 't1', code: 'CTR-001', plate: 'LXRS-21', current_km: 84200, next_maintenance_km: 90000, status: 'operativo' },
    { id: 't2', code: 'CTR-002', plate: 'LXTP-84', current_km: 76450, next_maintenance_km: 78000, status: 'operativo' },
    { id: 't3', code: 'CTR-003', plate: 'LYBB-33', current_km: 91800, next_maintenance_km: 92600, status: 'operativo' },
    { id: 't4', code: 'CTR-004', plate: 'LYCD-07', current_km: 68900, next_maintenance_km: 75000, status: 'operativo' },
  ]
  const users: User[] = [
    { id: 'u0', name: 'Luis Movillo', rut: '12.345.678-5', role: 'admin', truck_id: null, active: true },
    { id: 'u1', name: 'Pedro Soto', rut: '14.567.890-3', role: 'driver', truck_id: 't1', active: true },
    { id: 'u2', name: 'Juan Fuentes', rut: '15.678.901-1', role: 'driver', truck_id: 't2', active: true },
    { id: 'u3', name: 'Marcos Rivas', rut: '16.789.012-K', role: 'driver', truck_id: 't3', active: true },
    { id: 'u4', name: 'Diego Ulloa', rut: '17.890.123-8', role: 'driver', truck_id: 't4', active: true },
    { id: 'u5', name: 'Camilo Peña', rut: '19.012.345-6', role: 'helper', truck_id: 't1', active: true },
    { id: 'u6', name: 'Andrés Vidal', rut: '19.123.456-4', role: 'helper', truck_id: 't2', active: true },
  ]
  const routes: Route[] = [
    { id: 'r1', name: 'Santiago → Valparaíso', origin: 'CD Santiago', destination: 'Valparaíso', planned_km: 240, has_toll: true, toll_cost: 12400 },
    { id: 'r2', name: 'Santiago → Viña del Mar', origin: 'CD Santiago', destination: 'Viña del Mar', planned_km: 250, has_toll: true, toll_cost: 12400 },
    { id: 'r3', name: 'Santiago → Quillota / La Calera', origin: 'CD Santiago', destination: 'La Calera', planned_km: 220, has_toll: true, toll_cost: 9800 },
    { id: 'r4', name: 'Santiago → San Antonio', origin: 'CD Santiago', destination: 'San Antonio', planned_km: 230, has_toll: true, toll_cost: 10600 },
  ]
  const today = hoy()
  const route_assignments: RouteAssignment[] = [
    { id: 'a1', route_id: 'r1', truck_id: 't1', driver_id: 'u1', date: today, status: 'pendiente' },
    { id: 'a2', route_id: 'r2', truck_id: 't2', driver_id: 'u2', date: today, status: 'pendiente' },
  ]
  const delivery_stops: DeliveryStop[] = [
    { id: 's1', route_assignment_id: 'a1', stop_order: 1, client_name: 'Supermercado El Puerto', address: 'Av. Argentina 850, Valparaíso', contact_name: 'R. Carvajal', contact_phone: '+56 9 8877 1122', planned_kg: 420, planned_items: 36, lat: -33.0472, lng: -71.6127 },
    { id: 's2', route_assignment_id: 'a1', stop_order: 2, client_name: 'Distribuidora Cerro Alegre', address: 'Almirante Montt 315, Valparaíso', contact_name: 'P. Ahumada', contact_phone: '+56 9 6655 3344', planned_kg: 180, planned_items: 15, lat: -33.0403, lng: -71.6276 },
    { id: 's3', route_assignment_id: 'a1', stop_order: 3, client_name: 'Pescadería Caleta Portales', address: 'Av. España 2801, Valparaíso', contact_name: 'M. Godoy', contact_phone: '+56 9 5544 2211', planned_kg: 260, planned_items: 22, lat: -33.0284, lng: -71.5946 },
    { id: 's4', route_assignment_id: 'a2', stop_order: 1, client_name: 'Minimarket Recreo', address: 'Av. España 340, Viña del Mar', contact_name: 'C. Tapia', contact_phone: '+56 9 4433 5566', planned_kg: 310, planned_items: 28, lat: -33.0153, lng: -71.5644 },
    { id: 's5', route_assignment_id: 'a2', stop_order: 2, client_name: 'Hotel del Mar Cocina', address: 'Av. San Martín 199, Viña del Mar', contact_name: 'F. Reyes', contact_phone: '+56 9 3322 6677', planned_kg: 150, planned_items: 12, lat: -33.0089, lng: -71.5509 },
  ]
  // Gastos de los últimos 2 meses para alimentar dashboard / P&L
  const cats: [Expense['category'], number][] = [
    ['combustible', 950000], ['peaje_tag', 195000], ['mantencion', 240000],
    ['remuneraciones', 1450000], ['merma', 87500], ['seguros', 120000],
  ]
  const expenses: Expense[] = []
  const now = new Date()
  for (let m = 0; m < 2; m++) {
    for (const t of trucks) {
      for (const [category, base] of cats) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 8 + trucks.indexOf(t) * 3)
        expenses.push({
          id: uid(), truck_id: t.id, category,
          amount_clp: Math.round(base * (0.85 + ((t.id.charCodeAt(1) + m) % 7) * 0.05)),
          expense_date: d.toISOString().slice(0, 10),
          description: null,
        })
      }
    }
  }
  return {
    trucks, users, routes, route_assignments, delivery_stops, expenses,
    daily_checkins: [], delivery_records: [], stop_visits: [],
    maintenance_alerts: [], km_warnings: [],
  }
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* seed fresco si el storage está corrupto */ }
  const db = seed()
  save(db)
  return db
}

function save(db: DB) {
  localStorage.setItem(KEY, JSON.stringify(db))
}

type Listener = () => void
const listeners = new Set<Listener>()

let db = load()

export const store = {
  get: () => db,
  subscribe(fn: Listener) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },
  mutate(fn: (db: DB) => void) {
    fn(db)
    save(db)
    listeners.forEach(l => l())
  },
  reset() {
    db = seed()
    save(db)
    listeners.forEach(l => l())
  },
  uid,
}
