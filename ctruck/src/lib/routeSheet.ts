// Hoja de Ruta · generación de PDF con jsPDF.
// Documento claro (papel) con la identidad CTruck: datos del vehículo,
// aptitud, check-in, recepción de carga, entregas y check-out.
import { jsPDF } from 'jspdf'
import type { DB } from './store'
import { fecha, hora, num } from './format'
import { APTITUDE_QUESTIONS } from './types'

// Helvetica de jsPDF no incluye '→' ni otros símbolos fuera de WinAnsi
const pdfSafe = (s: string) => s.replace(/→/g, '-').replace(/[⚠]/g, '(!)')

const ORANGE = '#F97316'
const INK = '#0F172A'
const MUTED = '#64748B'
const LINE = '#CBD5E1'

export function buildRouteSheet(db: DB, truckId: string, date: string): jsPDF | null {
  const truck = db.trucks.find(t => t.id === truckId)
  if (!truck) return null
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 18
  let y = 20

  const ensure = (needed: number) => {
    if (y + needed > 282) {
      doc.addPage()
      y = 20
    }
  }
  const section = (title: string) => {
    ensure(14)
    y += 4
    doc.setTextColor(ORANGE)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(title.toUpperCase(), M, y)
    y += 2
    doc.setDrawColor(LINE)
    doc.setLineWidth(0.2)
    doc.line(M, y, W - M, y)
    y += 6
    doc.setTextColor(INK)
  }
  const row = (label: string, value: string) => {
    ensure(6)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(MUTED)
    doc.text(label, M, y)
    doc.setTextColor(INK)
    doc.setFont('helvetica', 'bold')
    doc.text(pdfSafe(value), M + 58, y)
    y += 6
  }

  // Encabezado
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(INK)
  doc.text('C', M, y)
  doc.setTextColor(ORANGE)
  doc.text('TRUCK', M + 7, y)
  doc.setFontSize(9)
  doc.setTextColor(MUTED)
  doc.setFont('helvetica', 'normal')
  doc.text('Hoja de Ruta · Truck OS', W - M, y - 4, { align: 'right' })
  doc.setFontSize(12)
  doc.setTextColor(INK)
  doc.setFont('helvetica', 'bold')
  doc.text(`${truck.code} · ${fecha(date)}`, W - M, y + 2, { align: 'right' })
  y += 10

  // Vehículo
  const driver = db.users.find(u => u.truck_id === truck.id && u.role === 'driver')
  const helpers = db.users.filter(u => u.truck_id === truck.id && u.role === 'helper')
  section('Vehículo y personal')
  row('Camión', `${truck.code} · patente ${truck.plate}`)
  row('Kilometraje actual', `${num(truck.current_km)} km`)
  row('Próxima mantención', `${num(truck.next_maintenance_km)} km (quedan ${num(truck.next_maintenance_km - truck.current_km)} km)`)
  row('Chofer', driver?.name ?? '—')
  if (helpers.length) row('Pioneta(s)', helpers.map(h => h.name).join(', '))

  // Check-ins del día
  const checkins = db.daily_checkins.filter(c => c.truck_id === truck.id && c.date === date)
  section('Declaración de aptitud y check-in')
  if (checkins.length === 0) {
    row('Estado', 'Sin check-in registrado este día')
  }
  for (const c of checkins) {
    const u = db.users.find(u => u.id === c.user_id)
    row(`${u?.name ?? '—'}`, c.aptitude_result === 'apto'
      ? `APTO · check-in ${hora(c.checkin_time)}${c.signature_name ? ' · firmado' : ''}`
      : `NO APTO · día sin remuneración (${hora(c.checkin_time)})`)
    if (c.aptitude_result === 'apto' && c.role === 'driver') {
      row('  Km entrada', c.km_in !== null ? `${num(c.km_in)} km${c.km_warning ? '  ⚠ discrepancia >500 km' : ''}` : '—')
    }
  }
  // Nota de las 4 declaraciones
  doc.setFontSize(7.5)
  doc.setTextColor(MUTED)
  doc.setFont('helvetica', 'normal')
  const legal = 'Declaraciones: ' + APTITUDE_QUESTIONS.map((q, i) => `${i + 1}) ${q}`).join(' ')
  const lines = doc.splitTextToSize(legal, W - M * 2)
  ensure(lines.length * 3.4 + 2)
  doc.text(lines, M, y)
  y += lines.length * 3.4 + 2
  doc.setTextColor(INK)

  // Fotos del check-in
  const withPhotos = checkins.find(c => c.dashboard_photo_url || c.cabin_photo_url)
  if (withPhotos) {
    ensure(48)
    let x = M
    for (const [label, url] of [['Panel / odómetro', withPhotos.dashboard_photo_url], ['Interior cabina', withPhotos.cabin_photo_url]] as const) {
      if (!url) continue
      try {
        doc.addImage(url, 'JPEG', x, y, 54, 38)
        doc.setFontSize(7.5)
        doc.setTextColor(MUTED)
        doc.text(label, x, y + 42)
      } catch { /* dataURL inválida: omitir imagen */ }
      x += 60
    }
    y += 48
    doc.setTextColor(INK)
  }

  // Ruta y recepción
  const assignment = db.route_assignments.find(a => a.truck_id === truck.id && a.date === date)
  const route = assignment ? db.routes.find(r => r.id === assignment.route_id) : null
  section('Ruta y recepción de carga')
  if (route && assignment) {
    row('Ruta', route.name)
    row('Km planificados', `${num(route.planned_km)} km ±30`)
    const recs = db.cargo_receptions.filter(c => c.route_assignment_id === assignment.id)
    if (recs.length === 0) row('Recepción', 'Sin registro')
    for (const r of recs) {
      const u = db.users.find(u => u.id === r.reported_by)
      row(`Recepción · ${u?.name ?? '—'}`, `Factura ${r.invoice_number} · despachó ${r.dispatcher_name} · ${hora(r.timestamp)} · ${r.photo_urls.length} foto(s)`)
    }

    // Entregas
    const stops = db.delivery_stops
      .filter(s => s.route_assignment_id === assignment.id)
      .sort((a, b) => a.stop_order - b.stop_order)
    section('Entregas')
    for (const s of stops) {
      const rec = db.delivery_records.find(r => r.stop_id === s.id)
      const visit = db.stop_visits.find(v => v.stop_id === s.id)
      const dwell = visit?.departed_at
        ? ` · ${Math.round((new Date(visit.departed_at).getTime() - new Date(visit.arrived_at).getTime()) / 60000)} min en parada`
        : ''
      ensure(12)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(`${s.stop_order}. ${s.client_name}`, M, y)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(MUTED)
      doc.setFontSize(8.5)
      doc.text(`${s.address} · ${num(s.planned_kg)} kg · ${s.planned_items} bultos`, M, y + 4)
      doc.setTextColor(INK)
      doc.setFontSize(9)
      const status = rec
        ? rec.has_issue
          ? `INCIDENTE: ${rec.issue_type}${rec.notes ? ` — ${rec.notes}` : ''} · recibió ${rec.recipient_name} · ${hora(rec.timestamp)}${dwell}`
          : `Entregada · recibió ${rec.recipient_name}${rec.recipient_rut ? ` (${rec.recipient_rut})` : ''} · ${hora(rec.timestamp)}${dwell}`
        : 'Pendiente'
      doc.setTextColor(rec ? (rec.has_issue ? '#B45309' : '#15803D') : MUTED)
      doc.text(pdfSafe(status), W - M, y, { align: 'right', maxWidth: 90 })
      doc.setTextColor(INK)
      y += 11
    }
  } else {
    row('Ruta', 'Sin asignación este día')
  }

  // Check-out
  section('Check-out')
  const dc = checkins.find(c => c.role === 'driver')
  if (dc?.checkout_time && dc.checkout_km !== null) {
    row('Km salida', `${num(dc.checkout_km)} km · ${hora(dc.checkout_time)}`)
    if (dc.km_in !== null) row('Km recorridos', `${num(dc.checkout_km - dc.km_in)} km${dc.checkout_warning ? '  ⚠ fuera de tolerancia ±30 km' : ''}`)
  } else {
    row('Estado', 'Turno aún abierto o sin registro')
  }

  // Pie
  doc.setFontSize(7.5)
  doc.setTextColor(MUTED)
  doc.text(`Generado por CTruck · Truck OS · ${new Date().toLocaleString('es-CL')}`, M, 290)

  return doc
}
