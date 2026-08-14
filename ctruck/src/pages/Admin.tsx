// Módulo 6 · Panel de administración Truck OS.
// Tabs: Resumen · Flota · Rutas · Gastos · P&L · Equipo
import { useMemo, useState, useSyncExternalStore } from 'react'
import Shell, { roleLabel } from '../components/Shell'
import { Badge, Button, Card, Dot, Empty, Progress, Segmented, Stat } from '../components/ui'
import { store } from '../lib/store'
import { clp, fecha, hora, hoy, num } from '../lib/format'
import type { ExpenseCategory } from '../lib/types'

type Tab = 'resumen' | 'flota' | 'rutas' | 'hoja' | 'gastos' | 'pnl' | 'equipo'

const CAT_LABEL: Record<ExpenseCategory, string> = {
  combustible: 'Combustible', peaje_tag: 'Peajes / TAG', mantencion: 'Mantención',
  remuneraciones: 'Remuneraciones', merma: 'Merma', seguros: 'Seguros', otros: 'Otros',
}

// Ingreso mensual estimado por camión mientras no se conecta facturación real.
const INGRESO_ESTIMADO_MES = 3950000

export default function Admin() {
  const [tab, setTab] = useState<Tab>('resumen')
  const db = useSyncExternalStore(store.subscribe, store.get)
  const today = hoy()

  const checkinsToday = db.daily_checkins.filter(c => c.date === today)
  const pendingAlerts =
    db.maintenance_alerts.filter(a => !a.acknowledged).length +
    db.km_warnings.filter(w => !w.acknowledged).length +
    checkinsToday.filter(c => c.aptitude_result === 'no_apto').length

  return (
    <Shell title="Panel de control">
      <div className="mb-6 -mx-4 px-4 overflow-x-auto">
        <Segmented<Tab>
          value={tab} onChange={setTab}
          options={[
            { value: 'resumen', label: pendingAlerts ? `Resumen · ${pendingAlerts}` : 'Resumen' },
            { value: 'flota', label: 'Flota' },
            { value: 'rutas', label: 'Rutas' },
            { value: 'hoja', label: 'Hoja de Ruta' },
            { value: 'gastos', label: 'Gastos' },
            { value: 'pnl', label: 'P&L' },
            { value: 'equipo', label: 'Equipo' },
          ]}
        />
      </div>
      {tab === 'resumen' && <Resumen />}
      {tab === 'flota' && <Flota />}
      {tab === 'rutas' && <Rutas />}
      {tab === 'hoja' && <HojaDeRuta />}
      {tab === 'gastos' && <Gastos />}
      {tab === 'pnl' && <PnL />}
      {tab === 'equipo' && <Equipo />}
    </Shell>
  )
}

/* ─── Resumen ─────────────────────────────────────────────── */
function Resumen() {
  const db = useSyncExternalStore(store.subscribe, store.get)
  const today = hoy()
  const checkins = db.daily_checkins.filter(c => c.date === today)
  const assignments = db.route_assignments.filter(a => a.date === today)
  const stopsToday = db.delivery_stops.filter(s => assignments.some(a => a.id === s.route_assignment_id))
  const delivered = db.delivery_records.filter(r => stopsToday.some(s => s.id === r.stop_id))
  const incidents = delivered.filter(r => r.has_issue)
  const kgToday = stopsToday.reduce((a, s) => a + s.planned_kg, 0)

  const alerts: { tone: 'danger' | 'warn'; text: string; when?: string }[] = []
  for (const c of checkins.filter(c => c.aptitude_result === 'no_apto')) {
    const u = db.users.find(u => u.id === c.user_id)
    alerts.push({ tone: 'danger', text: `${u?.name ?? '—'} marcó NO APTO en su declaración`, when: c.checkin_time })
  }
  for (const a of db.maintenance_alerts.filter(a => !a.acknowledged)) {
    const t = db.trucks.find(t => t.id === a.truck_id)
    alerts.push({
      tone: a.alert_type === 'red_1000' ? 'danger' : 'warn',
      text: `${t?.code}: quedan ${num(a.km_remaining)} km para la mantención`,
    })
  }
  for (const w of db.km_warnings.filter(w => !w.acknowledged)) {
    const t = db.trucks.find(t => t.id === w.truck_id)
    const u = db.users.find(u => u.id === w.driver_id)
    alerts.push({
      tone: 'warn',
      text: w.warning_type === 'checkin_discrepancy'
        ? `${t?.code}: discrepancia de ${num(w.km_diff)} km en check-in de ${u?.name}`
        : `${t?.code}: exceso de ${num(w.km_diff)} km vs ruta planificada (${u?.name})`,
      when: w.created_at,
    })
  }

  const ack = () => store.mutate(d => {
    d.maintenance_alerts.forEach(a => { a.acknowledged = true })
    d.km_warnings.forEach(w => { w.acknowledged = true })
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Check-ins hoy" value={`${checkins.filter(c => c.aptitude_result === 'apto').length}/${db.users.filter(u => (u.role === 'driver' || u.role === 'helper') && u.active).length}`} />
        <Stat label="Entregas" value={`${delivered.length}/${stopsToday.length}`} tone={delivered.length === stopsToday.length && stopsToday.length > 0 ? 'ok' : undefined} />
        <Stat label="Incidentes" value={String(incidents.length)} tone={incidents.length > 0 ? 'warn' : 'ok'} />
        <Stat label="Kg del día" value={num(kgToday)} sub="planificados" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="t-title">Alertas</h2>
          {alerts.length > 0 && <Button variant="ghost" className="!py-1.5 !px-4 !text-[14px]" onClick={ack}>Marcar todas como vistas</Button>}
        </div>
        {alerts.length === 0 ? (
          <Card><div className="flex items-center gap-3"><Dot tone="ok" /><span className="t-subhead">Sin alertas pendientes. Flota operando normal.</span></div></Card>
        ) : (
          <Card pad={false}>
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-center gap-3 px-5 py-3.5 ${i > 0 ? 'border-t border-os-border' : ''}`}>
                <Dot tone={a.tone} />
                <span className="t-body flex-1">{a.text}</span>
              </div>
            ))}
          </Card>
        )}
      </div>

      <div>
        <h2 className="t-title mb-3">Estado de flota</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {db.trucks.map(t => {
            const driver = db.users.find(u => u.truck_id === t.id && u.role === 'driver')
            const ci = checkins.find(c => c.truck_id === t.id && c.role === 'driver')
            return (
              <Card key={t.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="t-headline">{t.code}</span>
                  <Badge tone={ci ? (ci.aptitude_result === 'apto' ? (ci.checkout_time ? 'muted' : 'ok') : 'danger') : 'muted'}>
                    {ci ? (ci.aptitude_result === 'apto' ? (ci.checkout_time ? 'Turno cerrado' : 'En ruta') : 'No apto') : 'Sin check-in'}
                  </Badge>
                </div>
                <div className="t-footnote">{t.plate} · {driver?.name ?? 'sin chofer'} · <span className="tnum">{num(t.current_km)} km</span></div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ─── Flota ───────────────────────────────────────────────── */
function Flota() {
  const db = useSyncExternalStore(store.subscribe, store.get)
  return (
    <div className="space-y-4">
      {db.trucks.map(t => {
        const remaining = t.next_maintenance_km - t.current_km
        const window = 10000 // ventana visual entre mantenciones
        const pct = Math.max(0, Math.min(100, ((window - remaining) / window) * 100))
        const tone = remaining <= 1000 ? 'danger' : remaining <= 3000 ? 'warn' : 'ok'
        return (
          <Card key={t.id}>
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="t-headline">{t.code}</span>
                <span className="t-footnote">{t.plate}</span>
              </div>
              <Badge tone={tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'danger'}>
                {tone === 'danger' ? `🔴 Mantención urgente · ${num(remaining)} km` :
                 tone === 'warn' ? `🟡 Mantención pronto · ${num(remaining)} km` :
                 `Quedan ${num(remaining)} km`}
              </Badge>
            </div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="t-footnote tnum">Actual: {num(t.current_km)} km</span>
              <span className="t-footnote tnum">Próxima mantención: {num(t.next_maintenance_km)} km</span>
            </div>
            <Progress value={pct} tone={tone} />
          </Card>
        )
      })}
      <p className="t-footnote">Alerta amarilla automática a ≤3.000 km · alerta roja con push y correo a ≤1.000 km.</p>
    </div>
  )
}

/* ─── Rutas ───────────────────────────────────────────────── */
function Rutas() {
  const db = useSyncExternalStore(store.subscribe, store.get)
  const [routeId, setRouteId] = useState(db.routes[0]?.id ?? '')
  const [truckId, setTruckId] = useState(db.trucks[0]?.id ?? '')
  const today = hoy()
  const COSTO_KM_DESVIO = 520 // CLP/km estimado por combustible en ruta alternativa

  const assign = () => {
    const truck = db.trucks.find(t => t.id === truckId)
    const driver = db.users.find(u => u.truck_id === truckId && u.role === 'driver')
    if (!truck || !driver) return
    store.mutate(d => {
      d.route_assignments = d.route_assignments.filter(a => !(a.date === today && a.truck_id === truckId))
      d.route_assignments.push({ id: store.uid(), route_id: routeId, truck_id: truckId, driver_id: driver.id, date: today, status: 'pendiente' })
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="t-headline mb-4">Asignar ruta de hoy</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="t-caption block mb-2">Ruta</span>
            <select value={routeId} onChange={e => setRouteId(e.target.value)}
              className="w-full bg-os-card2 hairline rounded-os px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-accent/60">
              {db.routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="t-caption block mb-2">Camión</span>
            <select value={truckId} onChange={e => setTruckId(e.target.value)}
              className="w-full bg-os-card2 hairline rounded-os px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-accent/60">
              {db.trucks.map(t => <option key={t.id} value={t.id}>{t.code} · {db.users.find(u => u.truck_id === t.id && u.role === 'driver')?.name ?? 'sin chofer'}</option>)}
            </select>
          </label>
          <div className="flex items-end"><Button full onClick={assign}>Asignar</Button></div>
        </div>
      </Card>

      <div>
        <h2 className="t-title mb-3">Asignaciones de hoy</h2>
        {db.route_assignments.filter(a => a.date === today).length === 0
          ? <Empty title="Sin asignaciones hoy" />
          : (
            <Card pad={false}>
              {db.route_assignments.filter(a => a.date === today).map((a, i) => {
                const r = db.routes.find(r => r.id === a.route_id)!
                const t = db.trucks.find(t => t.id === a.truck_id)!
                const u = db.users.find(u => u.id === a.driver_id)
                return (
                  <div key={a.id} className={`flex items-center justify-between gap-3 px-5 py-4 flex-wrap ${i > 0 ? 'border-t border-os-border' : ''}`}>
                    <div>
                      <div className="t-headline">{r.name}</div>
                      <div className="t-footnote">{t.code} · {u?.name} · <span className="tnum">{num(r.planned_km)} km</span></div>
                    </div>
                    <Badge tone={a.status === 'completada' ? 'ok' : a.status === 'en_curso' ? 'info' : 'muted'}>
                      {a.status === 'en_curso' ? 'En curso' : a.status === 'completada' ? 'Completada' : 'Pendiente'}
                    </Badge>
                  </div>
                )
              })}
            </Card>
          )}
      </div>

      <div>
        <h2 className="t-title mb-3">TAG vs ruta sin peaje</h2>
        <div className="overflow-x-auto rounded-os-lg hairline">
          <table className="w-full text-[14px] tnum">
            <thead>
              <tr className="bg-os-card2 text-left">
                <th className="px-4 py-2.5 t-caption">Ruta</th>
                <th className="px-4 py-2.5 t-caption">Peaje TAG</th>
                <th className="px-4 py-2.5 t-caption">Desvío estimado</th>
                <th className="px-4 py-2.5 t-caption">Recomendación</th>
              </tr>
            </thead>
            <tbody className="bg-os-card">
              {db.routes.map(r => {
                const desvioKm = Math.round(r.planned_km * 0.18)
                const costoDesvio = desvioKm * COSTO_KM_DESVIO
                const conviene = r.toll_cost < costoDesvio
                return (
                  <tr key={r.id} className="border-t border-os-border">
                    <td className="px-4 py-3 font-medium" style={{ fontVariantNumeric: 'normal' }}>{r.name}</td>
                    <td className="px-4 py-3">{clp(r.toll_cost)}</td>
                    <td className="px-4 py-3">+{desvioKm} km ≈ {clp(costoDesvio)}</td>
                    <td className="px-4 py-3">
                      {conviene
                        ? <span className="text-ok font-semibold">TAG · ahorra {clp(costoDesvio - r.toll_cost)}</span>
                        : <span className="text-warn font-semibold">Sin peaje · ahorra {clp(r.toll_cost - costoDesvio)}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="t-footnote mt-2">Desvío estimado en +18% de km a {clp(COSTO_KM_DESVIO)}/km de combustible. Ajustable al conectar datos reales.</p>
      </div>
    </div>
  )
}

/* ─── Hoja de Ruta ────────────────────────────────────────── */
function HojaDeRuta() {
  const db = useSyncExternalStore(store.subscribe, store.get)
  const [truckId, setTruckId] = useState(db.trucks[0]?.id ?? '')
  const [date, setDate] = useState(hoy())

  const truck = db.trucks.find(t => t.id === truckId)
  const checkins = db.daily_checkins.filter(c => c.truck_id === truckId && c.date === date)
  const assignment = db.route_assignments.find(a => a.truck_id === truckId && a.date === date)
  const route = assignment ? db.routes.find(r => r.id === assignment.route_id) : null
  const stops = assignment ? db.delivery_stops.filter(s => s.route_assignment_id === assignment.id) : []
  const records = db.delivery_records.filter(r => stops.some(s => s.id === r.stop_id))
  const receptions = assignment ? db.cargo_receptions.filter(c => c.route_assignment_id === assignment.id) : []
  const driverCi = checkins.find(c => c.role === 'driver')

  const exportPdf = async () => {
    // jsPDF se carga bajo demanda: no pesa en la carga inicial de la app
    const { buildRouteSheet } = await import('../lib/routeSheet')
    const doc = buildRouteSheet(db, truckId, date)
    if (doc && truck) doc.save(`hoja-ruta_${truck.code}_${date}.pdf`)
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="t-caption block mb-2">Camión</span>
            <select value={truckId} onChange={e => setTruckId(e.target.value)}
              className="w-full bg-os-card2 hairline rounded-os px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-accent/60">
              {db.trucks.map(t => <option key={t.id} value={t.id}>{t.code} · {t.plate}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="t-caption block mb-2">Fecha</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-os-card2 hairline rounded-os px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-accent/60" />
          </label>
          <div className="flex items-end"><Button full onClick={exportPdf}>Exportar PDF</Button></div>
        </div>
      </Card>

      {/* Vista previa del documento */}
      <Card pad={false}>
        <div className="px-5 py-4 border-b border-os-border flex items-center justify-between">
          <span className="t-headline">{truck?.code} · {fecha(date)}</span>
          {route ? <Badge tone="info">{route.name}</Badge> : <Badge tone="muted">Sin ruta</Badge>}
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <div className="t-caption mb-1.5">Aptitud y check-in</div>
            {checkins.length === 0 && <div className="t-subhead">Sin registros ese día.</div>}
            {checkins.map(c => {
              const u = db.users.find(u => u.id === c.user_id)
              return (
                <div key={c.id} className="flex items-center justify-between py-1 flex-wrap gap-2">
                  <span className="t-body">{u?.name}</span>
                  {c.aptitude_result === 'apto'
                    ? <span className="t-footnote tnum">Apto · {hora(c.checkin_time)}{c.km_in !== null ? ` · ${num(c.km_in)} km` : ''}{c.km_warning ? ' ⚠' : ''}</span>
                    : <Badge tone="danger">No apto</Badge>}
                </div>
              )
            })}
          </div>
          <div>
            <div className="t-caption mb-1.5">Recepción de carga</div>
            {receptions.length === 0 && <div className="t-subhead">Sin registro.</div>}
            {receptions.map(r => (
              <div key={r.id} className="t-footnote py-0.5">
                {db.users.find(u => u.id === r.reported_by)?.name}: factura {r.invoice_number} · {r.dispatcher_name} · {r.photo_urls.length} foto(s)
              </div>
            ))}
          </div>
          <div>
            <div className="t-caption mb-1.5">Entregas</div>
            <div className="t-subhead tnum">{records.length}/{stops.length} completadas{records.some(r => r.has_issue) ? ` · ${records.filter(r => r.has_issue).length} con incidente` : ''}</div>
          </div>
          <div>
            <div className="t-caption mb-1.5">Check-out</div>
            {driverCi?.checkout_time
              ? <div className="t-subhead tnum">{num(driverCi.checkout_km! - (driverCi.km_in ?? 0))} km recorridos · cerró {hora(driverCi.checkout_time)}{driverCi.checkout_warning ? ' ⚠ fuera de tolerancia' : ''}</div>
              : <div className="t-subhead">Turno sin cerrar o sin registro.</div>}
          </div>
        </div>
      </Card>
      <p className="t-footnote">El PDF incluye las fotos del check-in y el detalle parada por parada con tiempos de permanencia. Al conectar Supabase, cada exportación se guarda además en el bucket <code>route-sheets</code>.</p>
    </div>
  )
}

/* ─── Gastos ──────────────────────────────────────────────── */
function Gastos() {
  const db = useSyncExternalStore(store.subscribe, store.get)
  const [truckFilter, setTruckFilter] = useState<string>('all')
  const monthKey = (d: string) => d.slice(0, 7)
  const thisMonth = monthKey(hoy())

  const filtered = db.expenses.filter(e => truckFilter === 'all' || e.truck_id === truckFilter)
  const current = filtered.filter(e => monthKey(e.expense_date) === thisMonth)
  const byCat = useMemo(() => {
    const m = new Map<ExpenseCategory, number>()
    for (const e of current) m.set(e.category, (m.get(e.category) ?? 0) + e.amount_clp)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [current])
  const total = current.reduce((a, e) => a + e.amount_clp, 0)
  const max = byCat[0]?.[1] ?? 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Segmented
          value={truckFilter}
          onChange={setTruckFilter}
          options={[{ value: 'all', label: 'Toda la flota' }, ...db.trucks.map(t => ({ value: t.id, label: t.code }))]}
        />
        <span className="t-footnote">Mes en curso</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label="Gasto del mes" value={clp(total)} />
        <Stat label="Merma" value={clp(byCat.find(([c]) => c === 'merma')?.[1] ?? 0)} tone="warn" />
        <Stat label="Combustible" value={clp(byCat.find(([c]) => c === 'combustible')?.[1] ?? 0)} />
      </div>

      <div>
        <h2 className="t-title mb-3">Distribución por categoría</h2>
        <Card>
          <div className="space-y-4">
            {byCat.map(([cat, amount]) => (
              <div key={cat}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="t-headline">{CAT_LABEL[cat]}</span>
                  <span className="tnum t-headline">{clp(amount)}</span>
                </div>
                <div className="h-2 rounded-full bg-os-card2 overflow-hidden">
                  <div className={`h-full rounded-full ${cat === 'merma' ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${(amount / max) * 100}%` }} />
                </div>
              </div>
            ))}
            {byCat.length === 0 && <Empty title="Sin gastos este mes" />}
          </div>
        </Card>
      </div>
      <p className="t-footnote">El registro móvil de gastos con foto de boleta (chofer) llega en la Fase 2 completa; por ahora los gastos se cargan desde el panel o el seed demo.</p>
    </div>
  )
}

/* ─── P&L ─────────────────────────────────────────────────── */
function PnL() {
  const db = useSyncExternalStore(store.subscribe, store.get)
  const thisMonth = hoy().slice(0, 7)
  const rows = db.trucks.map(t => {
    const gastos = db.expenses.filter(e => e.truck_id === t.id && e.expense_date.slice(0, 7) === thisMonth)
    const byCat = (c: ExpenseCategory) => gastos.filter(e => e.category === c).reduce((a, e) => a + e.amount_clp, 0)
    const totalGasto = gastos.reduce((a, e) => a + e.amount_clp, 0)
    const ingreso = INGRESO_ESTIMADO_MES
    const resultado = ingreso - totalGasto
    return { t, ingreso, byCat, totalGasto, resultado, margen: ingreso ? (resultado / ingreso) * 100 : 0 }
  })
  const totals = {
    ingreso: rows.reduce((a, r) => a + r.ingreso, 0),
    gasto: rows.reduce((a, r) => a + r.totalGasto, 0),
  }
  const resultado = totals.ingreso - totals.gasto
  const cats: ExpenseCategory[] = ['combustible', 'peaje_tag', 'remuneraciones', 'mantencion', 'merma', 'seguros']

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Ingresos del mes" value={clp(totals.ingreso)} sub="estimados" />
        <Stat label="Gastos" value={clp(totals.gasto)} />
        <Stat label="Resultado" value={clp(resultado)} tone={resultado >= 0 ? 'ok' : 'danger'} />
        <Stat label="Margen" value={`${((resultado / (totals.ingreso || 1)) * 100).toFixed(1)}%`} tone={resultado >= 0 ? 'ok' : 'danger'} />
      </div>

      <div className="overflow-x-auto rounded-os-lg hairline">
        <table className="w-full text-[14px] tnum">
          <thead>
            <tr className="bg-os-card2 text-left">
              <th className="px-4 py-2.5 t-caption">Concepto</th>
              {rows.map(r => <th key={r.t.id} className="px-4 py-2.5 t-caption text-right">{r.t.code}</th>)}
              <th className="px-4 py-2.5 t-caption text-right">Flota</th>
            </tr>
          </thead>
          <tbody className="bg-os-card">
            <tr className="border-t border-os-border">
              <td className="px-4 py-3 font-medium">Ingresos (est.)</td>
              {rows.map(r => <td key={r.t.id} className="px-4 py-3 text-right">{num(r.ingreso)}</td>)}
              <td className="px-4 py-3 text-right font-semibold">{num(totals.ingreso)}</td>
            </tr>
            {cats.map(c => (
              <tr key={c} className="border-t border-os-border">
                <td className="px-4 py-3 text-os-muted">{CAT_LABEL[c]}</td>
                {rows.map(r => <td key={r.t.id} className="px-4 py-3 text-right text-os-muted">−{num(r.byCat(c))}</td>)}
                <td className="px-4 py-3 text-right text-os-muted">−{num(rows.reduce((a, r) => a + r.byCat(c), 0))}</td>
              </tr>
            ))}
            <tr className="border-t border-os-border bg-os-card2/60">
              <td className="px-4 py-3 font-bold">Resultado</td>
              {rows.map(r => (
                <td key={r.t.id} className={`px-4 py-3 text-right font-bold ${r.resultado >= 0 ? 'text-ok' : 'text-danger'}`}>{num(r.resultado)}</td>
              ))}
              <td className={`px-4 py-3 text-right font-bold ${resultado >= 0 ? 'text-ok' : 'text-danger'}`}>{num(resultado)}</td>
            </tr>
            <tr className="border-t border-os-border">
              <td className="px-4 py-3 text-os-muted">Margen</td>
              {rows.map(r => (
                <td key={r.t.id} className={`px-4 py-3 text-right font-semibold ${r.margen >= 20 ? 'text-ok' : r.margen >= 10 ? 'text-warn' : 'text-danger'}`}>{r.margen.toFixed(1)}%</td>
              ))}
              <td className="px-4 py-3 text-right font-semibold">{((resultado / (totals.ingreso || 1)) * 100).toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="t-footnote">Cifras en CLP, mes en curso. Los ingresos son estimados hasta conectar la facturación (tabla <code>revenues</code> ya incluida en las migraciones). El consolidado semanal por correo se activa al conectar Supabase + Resend.</p>
    </div>
  )
}

/* ─── Equipo ──────────────────────────────────────────────── */
function Equipo() {
  const db = useSyncExternalStore(store.subscribe, store.get)
  const today = hoy()
  return (
    <div className="space-y-6">
      <Card pad={false}>
        {db.users.filter(u => u.active).map((u, i) => {
          const ci = db.daily_checkins.find(c => c.user_id === u.id && c.date === today)
          const truck = db.trucks.find(t => t.id === u.truck_id)
          return (
            <div key={u.id} className={`flex items-center justify-between gap-3 px-5 py-4 flex-wrap ${i > 0 ? 'border-t border-os-border' : ''}`}>
              <div>
                <div className="t-headline">{u.name}</div>
                <div className="t-footnote">{roleLabel(u.role)}{truck ? ` · ${truck.code}` : ''} · {u.rut}</div>
              </div>
              {u.role === 'admin' || u.role === 'supervisor'
                ? <Badge tone="muted">Panel</Badge>
                : ci
                  ? ci.aptitude_result === 'apto'
                    ? <Badge tone={ci.checkout_time ? 'muted' : 'ok'}>{ci.checkout_time ? `Cerrado · ${num(ci.checkout_km! - (ci.km_in ?? 0))} km` : 'En turno ✓'}</Badge>
                    : <Badge tone="danger">No apto</Badge>
                  : <Badge tone="warn">Sin check-in</Badge>}
            </div>
          )
        })}
      </Card>
      <p className="t-footnote">La creación y edición de perfiles desde el panel (con invitación por correo) se habilita al conectar Supabase Auth — Fase 1 completa. Fecha: {fecha(new Date())}.</p>
    </div>
  )
}
