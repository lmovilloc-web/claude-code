// Tipos del dominio CTruck — espejo de las tablas de Supabase

export type Role = 'super_admin' | 'admin' | 'supervisor' | 'driver' | 'helper'
export type TruckStatus = 'operativo' | 'mantencion' | 'detenido'
export type AssignmentStatus = 'pendiente' | 'en_curso' | 'completada'
export type AptitudeResult = 'apto' | 'no_apto'

export interface Truck {
  id: string
  code: string
  plate: string
  current_km: number
  next_maintenance_km: number
  status: TruckStatus
}

export interface User {
  id: string
  name: string
  rut: string
  role: Role
  truck_id: string | null
  email?: string
  auth_id?: string
  active: boolean
}

export interface DailyCheckin {
  id: string
  user_id: string
  truck_id: string | null
  date: string
  role: Role
  aptitude_result: AptitudeResult
  aptitude_answers: boolean[]
  km_in: number | null
  km_system: number | null
  km_diff: number | null
  km_warning: boolean
  dashboard_photo_url: string | null
  cabin_photo_url: string | null
  signature_name: string | null
  checkout_km: number | null
  checkout_diff: number | null
  checkout_warning: boolean
  checkin_time: string
  checkout_time: string | null
}

export interface Route {
  id: string
  name: string
  origin: string
  destination: string
  planned_km: number
  has_toll: boolean
  toll_cost: number
}

export interface RouteAssignment {
  id: string
  route_id: string
  truck_id: string
  driver_id: string
  date: string
  status: AssignmentStatus
}

export interface DeliveryStop {
  id: string
  route_assignment_id: string
  stop_order: number
  client_name: string
  address: string
  contact_name: string
  contact_phone: string
  planned_kg: number
  planned_items: number
  lat: number | null
  lng: number | null
}

export interface DeliveryRecord {
  id: string
  stop_id: string
  reported_by: string
  recipient_name: string
  recipient_rut: string | null
  has_issue: boolean
  issue_type: string | null
  notes: string | null
  timestamp: string
}

export interface CargoReception {
  id: string
  route_assignment_id: string
  reported_by: string
  invoice_number: string
  dispatcher_name: string
  route_confirmed: boolean
  photo_urls: string[]
  timestamp: string
}

export interface StopVisit {
  id: string
  stop_id: string
  arrived_at: string
  departed_at: string | null
  reported_by?: string
}

export interface MaintenanceAlert {
  id: string
  truck_id: string
  alert_type: 'yellow_3000' | 'red_1000'
  km_remaining: number
  acknowledged: boolean
}

export interface KmWarning {
  id: string
  truck_id: string
  driver_id: string
  warning_type: 'checkin_discrepancy' | 'checkout_excess'
  km_diff: number
  acknowledged: boolean
  created_at: string
}

export type ExpenseCategory =
  | 'combustible'
  | 'peaje_tag'
  | 'mantencion'
  | 'remuneraciones'
  | 'merma'
  | 'seguros'
  | 'otros'

export interface Expense {
  id: string
  truck_id: string | null
  category: ExpenseCategory
  amount_clp: number
  expense_date: string
  description: string | null
}

export const APTITUDE_QUESTIONS = [
  'Declaro estar completamente sobrio al iniciar este turno.',
  'Declaro no haber consumido sustancias ilegales en las últimas 24 horas.',
  'Me encuentro en condiciones físicas óptimas para operar el vehículo.',
  'Me encuentro psicológicamente apto para manejar de forma segura hoy.',
] as const

export const ISSUE_TYPES = [
  'Producto dañado',
  'Faltante en pedido',
  'Cliente rechazó',
  'Dirección incorrecta',
  'Problema temperatura',
  'Otro',
] as const
