// Módulo 3 · Check-out del chofer: km final, comparación con ruta ±30 km,
// warning + actualización de trucks.current_km.
import { useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/Shell'
import { Button, Card, Field } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { store } from '../lib/store'
import { hoy, num } from '../lib/format'

export default function CheckOut() {
  const { user } = useAuth()
  const nav = useNavigate()
  const db = useSyncExternalStore(store.subscribe, store.get)
  const [kmInput, setKmInput] = useState('')
  const [done, setDone] = useState<{ traveled: number; warning: boolean; planned: number | null } | null>(null)

  if (!user) return null
  const checkin = db.daily_checkins.find(c => c.user_id === user.id && c.date === hoy() && c.aptitude_result === 'apto')
  const assignment = db.route_assignments.find(a => a.driver_id === user.id && a.date === hoy())
  const route = assignment ? db.routes.find(r => r.id === assignment.route_id) : null

  if (!checkin || checkin.km_in === null) {
    return (
      <Shell title="Check-out">
        <Card className="max-w-md mx-auto text-center py-10">
          <p className="t-headline mb-2">No hay check-in activo hoy</p>
          <p className="t-subhead mb-6">Primero completa tu check-in de inicio de turno.</p>
          <Button onClick={() => nav('/checkin')}>Ir al check-in</Button>
        </Card>
      </Shell>
    )
  }

  const kmOut = parseInt(kmInput, 10)
  const valid = !isNaN(kmOut) && kmOut >= checkin.km_in
  const traveled = valid ? kmOut - checkin.km_in! : 0
  const planned = route?.planned_km ?? null
  const exceeds = valid && planned !== null && Math.abs(traveled - planned) > 30

  const submit = () => {
    if (!valid) return
    store.mutate(d => {
      const c = d.daily_checkins.find(x => x.id === checkin.id)!
      c.checkout_km = kmOut
      c.checkout_diff = planned !== null ? traveled - planned : null
      c.checkout_warning = exceeds
      c.checkout_time = new Date().toISOString()
      const t = d.trucks.find(t => t.id === user.truck_id)
      if (t) t.current_km = kmOut
      if (exceeds && t) {
        d.km_warnings.push({
          id: store.uid(), truck_id: t.id, driver_id: user.id,
          warning_type: 'checkout_excess', km_diff: traveled - (planned ?? 0),
          acknowledged: false, created_at: new Date().toISOString(),
        })
      }
      // Alerta de mantención al actualizar km
      if (t) {
        const remaining = t.next_maintenance_km - t.current_km
        const type = remaining <= 1000 ? 'red_1000' : remaining <= 3000 ? 'yellow_3000' : null
        if (type && !d.maintenance_alerts.some(a => a.truck_id === t.id && a.alert_type === type && !a.acknowledged)) {
          d.maintenance_alerts.push({ id: store.uid(), truck_id: t.id, alert_type: type, km_remaining: remaining, acknowledged: false })
        }
      }
    })
    setDone({ traveled, warning: exceeds, planned })
  }

  if (done) {
    return (
      <Shell title="Turno cerrado">
        <div className="max-w-md mx-auto text-center pt-8">
          <div className="text-5xl mb-6">{done.warning ? '⚠️' : '✅'}</div>
          <h2 className="t-title mb-2 tnum">{num(done.traveled)} km recorridos</h2>
          {done.planned !== null && (
            <p className="t-subhead mb-2 tnum">Planificado: {num(done.planned)} km · diferencia {done.traveled - done.planned > 0 ? '+' : ''}{num(done.traveled - done.planned)} km</p>
          )}
          {done.warning && <p className="t-footnote text-warn mb-6">Se registró un aviso de exceso de kilometraje para el supervisor.</p>}
          <Button full className="mt-4" onClick={() => nav('/hoy')}>Volver a mi día</Button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell title="Check-out">
      <div className="max-w-md mx-auto">
        <Card className="mb-5">
          <div className="flex justify-between"><span className="t-subhead">Km de entrada</span><span className="t-headline tnum">{num(checkin.km_in)} km</span></div>
          {route && <div className="flex justify-between mt-2"><span className="t-subhead">Ruta planificada</span><span className="t-headline tnum">{num(route.planned_km)} km ±30</span></div>}
        </Card>
        <Field
          label="Odómetro final" type="number" inputMode="numeric" placeholder="0"
          value={kmInput} onChange={e => setKmInput(e.target.value)}
          className="text-center !text-[34px] font-extrabold tnum py-6" autoFocus
        />
        {kmInput && !valid && (
          <div className="mt-3 rounded-os bg-danger/10 hairline px-4 py-3 text-[14px] text-danger font-medium">
            El km final no puede ser menor al de entrada ({num(checkin.km_in)} km).
          </div>
        )}
        {valid && exceeds && (
          <div className="mt-3 rounded-os bg-warn/10 hairline px-4 py-3 text-[14px] text-warn font-medium">
            Recorriste {num(traveled)} km, fuera de la tolerancia de ±30 km sobre {num(planned!)} km planificados. Se avisará al supervisor.
          </div>
        )}
        <Button full className="mt-5" disabled={!valid} onClick={submit}>Cerrar turno</Button>
      </div>
    </Shell>
  )
}
