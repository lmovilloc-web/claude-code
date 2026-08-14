// Pantalla "Mi día" del chofer/pioneta: estado del turno, ruta asignada,
// paradas con navegación Google Maps (deep links, gratis) y cronómetro
// por parada con alertas cada 15 minutos (Fase 6).
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Shell from '../components/Shell'
import { Button, Card, Badge, Field, Empty } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { store } from '../lib/store'
import { hoy, num, hora } from '../lib/format'
import type { DeliveryStop } from '../lib/types'
import { ISSUE_TYPES } from '../lib/types'

function mapsUrl(stop: DeliveryStop) {
  const dest = stop.lat && stop.lng ? `${stop.lat},${stop.lng}` : encodeURIComponent(stop.address)
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`
}

function fullRouteUrl(stops: DeliveryStop[]) {
  const pts = stops.map(s => (s.lat && s.lng ? `${s.lat},${s.lng}` : encodeURIComponent(s.address)))
  const dest = pts[pts.length - 1]
  const waypoints = pts.slice(0, -1).join('|')
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent('CD Santiago')}&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`
}

/** Cronómetro de permanencia en parada; alerta local cada 15 min. */
function DwellTimer({ arrivedAt }: { arrivedAt: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const secs = Math.floor((now - new Date(arrivedAt).getTime()) / 1000)
  const mins = Math.floor(secs / 60)
  const over = Math.floor(mins / 15) // múltiplos de 15 min cruzados
  useEffect(() => {
    if (mins > 0 && mins % 15 === 0 && secs % 60 === 0) {
      if ('vibrate' in navigator) navigator.vibrate?.([200, 100, 200])
      if (Notification?.permission === 'granted') {
        new Notification('CTruck', { body: `Llevas ${mins} minutos en esta parada.` })
      }
    }
  }, [mins, secs])
  const mm = String(mins).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  return (
    <span className={`tnum font-extrabold text-[22px] ${over >= 2 ? 'text-danger' : over >= 1 ? 'text-warn' : 'text-ok'}`}>
      {mm}:{ss}
    </span>
  )
}

export default function Today() {
  const { user } = useAuth()
  const nav = useNavigate()
  const db = useSyncExternalStore(store.subscribe, store.get)
  const [issueStop, setIssueStop] = useState<string | null>(null)
  const [recipient, setRecipient] = useState('')
  const [recipientRut, setRecipientRut] = useState('')
  const [hasIssue, setHasIssue] = useState(false)
  const [issueType, setIssueType] = useState<string>(ISSUE_TYPES[0])
  const [notes, setNotes] = useState('')

  if (!user) return null
  const today = hoy()
  const checkin = db.daily_checkins.find(c => c.user_id === user.id && c.date === today)
  const assignment = db.route_assignments.find(a =>
    a.date === today && (a.driver_id === user.id || (user.truck_id && a.truck_id === user.truck_id)))
  const route = assignment ? db.routes.find(r => r.id === assignment.route_id) : null
  const stops = assignment
    ? db.delivery_stops.filter(s => s.route_assignment_id === assignment.id).sort((a, b) => a.stop_order - b.stop_order)
    : []
  const records = db.delivery_records
  const visits = db.stop_visits
  const deliveredIds = new Set(records.filter(r => stops.some(s => s.id === r.stop_id)).map(r => r.stop_id))
  const firstPendingIdx = stops.findIndex(s => !deliveredIds.has(s.id))

  const arrive = (stopId: string) => {
    if (Notification && Notification.permission === 'default') Notification.requestPermission()
    store.mutate(d => {
      d.stop_visits.push({ id: store.uid(), stop_id: stopId, arrived_at: new Date().toISOString(), departed_at: null })
    })
  }

  const deliver = (stopId: string) => {
    store.mutate(d => {
      d.delivery_records.push({
        id: store.uid(), stop_id: stopId, reported_by: user.id,
        recipient_name: recipient, recipient_rut: recipientRut || null,
        has_issue: hasIssue, issue_type: hasIssue ? issueType : null,
        notes: notes || null, timestamp: new Date().toISOString(),
      })
      const v = d.stop_visits.find(v => v.stop_id === stopId && !v.departed_at)
      if (v) v.departed_at = new Date().toISOString()
      const remaining = stops.filter(s => s.id !== stopId && !deliveredIds.has(s.id))
      if (remaining.length === 0 && assignment) {
        const a = d.route_assignments.find(x => x.id === assignment.id)
        if (a) a.status = 'completada'
      }
    })
    setIssueStop(null); setRecipient(''); setRecipientRut(''); setHasIssue(false); setNotes('')
  }

  return (
    <Shell title="Mi día">
      {/* Estado del turno */}
      <Card className="mb-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="t-caption mb-1">Turno de hoy</div>
            {!checkin && <div className="t-headline">Sin check-in todavía</div>}
            {checkin?.aptitude_result === 'no_apto' && <Badge tone="danger">No apto · día cerrado</Badge>}
            {checkin?.aptitude_result === 'apto' && !checkin.checkout_time && (
              <div className="t-headline">Check-in {hora(checkin.checkin_time)} {checkin.km_in && `· ${num(checkin.km_in)} km`}</div>
            )}
            {checkin?.checkout_time && checkin.aptitude_result === 'apto' && (
              <div className="t-headline">Turno cerrado · {hora(checkin.checkout_time)}</div>
            )}
          </div>
          {!checkin && <Button onClick={() => nav('/checkin')}>Iniciar check-in</Button>}
          {checkin?.aptitude_result === 'apto' && !checkin.checkout_time && user.role === 'driver' && (
            <Link to="/checkout"><Button variant="secondary">Check-out</Button></Link>
          )}
        </div>
      </Card>

      {/* Ruta del día */}
      {route && assignment ? (
        <>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="t-title">{route.name}</h2>
            <Badge tone={assignment.status === 'completada' ? 'ok' : assignment.status === 'en_curso' ? 'info' : 'muted'}>
              {assignment.status === 'en_curso' ? 'En curso' : assignment.status === 'completada' ? 'Completada' : 'Pendiente'}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <span className="t-footnote tnum">{num(route.planned_km)} km planificados · {stops.length} paradas · {num(stops.reduce((a, s) => a + s.planned_kg, 0))} kg</span>
            {stops.length > 0 && (
              <a href={fullRouteUrl(stops)} target="_blank" rel="noreferrer"
                className="t-footnote font-semibold text-accent">Ver ruta completa en Google Maps ↗</a>
            )}
          </div>

          <div className="space-y-4">
            {stops.map((s, i) => {
              const delivered = deliveredIds.has(s.id)
              const locked = firstPendingIdx !== -1 && i > firstPendingIdx
              const visit = visits.find(v => v.stop_id === s.id && !v.departed_at)
              const record = records.find(r => r.stop_id === s.id)
              return (
                <Card key={s.id} className={locked ? 'opacity-45' : ''}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="w-6 h-6 rounded-full bg-os-card2 hairline inline-flex items-center justify-center text-[12px] font-bold text-accent shrink-0">{s.stop_order}</span>
                        <span className="t-headline truncate">{s.client_name}</span>
                      </div>
                      <div className="t-footnote">{s.address}</div>
                      <div className="t-footnote tnum mt-0.5">{s.contact_name} · {s.contact_phone} · {num(s.planned_kg)} kg · {s.planned_items} bultos</div>
                    </div>
                    {delivered && <Badge tone={record?.has_issue ? 'warn' : 'ok'}>{record?.has_issue ? 'Incidente' : 'Entregada'}</Badge>}
                    {locked && <Badge tone="muted">Bloqueada</Badge>}
                  </div>

                  {!delivered && !locked && (
                    <div className="mt-4 flex items-center gap-3 flex-wrap">
                      <a href={mapsUrl(s)} target="_blank" rel="noreferrer">
                        <Button variant="secondary" className="!py-2 !text-[15px]">🧭 Navegar</Button>
                      </a>
                      {!visit ? (
                        <Button className="!py-2 !text-[15px]" onClick={() => arrive(s.id)}>Llegué</Button>
                      ) : (
                        <div className="flex items-center gap-3 flex-wrap">
                          <DwellTimer arrivedAt={visit.arrived_at} />
                          <Button className="!py-2 !text-[15px]" onClick={() => setIssueStop(issueStop === s.id ? null : s.id)}>
                            Registrar entrega
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {issueStop === s.id && visit && (
                    <div className="mt-4 pt-4 border-t border-os-border space-y-3">
                      <Field label="Nombre de quien recibe (obligatorio)" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Nombre y apellido" />
                      <Field label="RUT (opcional)" value={recipientRut} onChange={e => setRecipientRut(e.target.value)} placeholder="12.345.678-9" />
                      <label className="flex items-center gap-3 py-1 cursor-pointer">
                        <input type="checkbox" checked={hasIssue} onChange={e => setHasIssue(e.target.checked)} className="w-5 h-5 accent-[#F97316]" />
                        <span className="t-headline">Hubo un incidente</span>
                      </label>
                      {hasIssue && (
                        <div>
                          <span className="t-caption block mb-2">Tipo de incidente</span>
                          <div className="flex flex-wrap gap-2">
                            {ISSUE_TYPES.map(t => (
                              <button key={t} onClick={() => setIssueType(t)}
                                className={`os-t rounded-full px-3.5 py-1.5 text-[13px] font-semibold hairline ${issueType === t ? 'bg-warn/20 text-warn' : 'bg-os-card2 text-os-muted'}`}>
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <Field label="Notas (opcional)" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones" />
                      <Button full disabled={!recipient} onClick={() => deliver(s.id)}>Confirmar entrega</Button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      ) : (
        <Empty icon="🗺" title="Sin ruta asignada para hoy" sub="El administrador asigna las rutas desde el panel." />
      )}
    </Shell>
  )
}
