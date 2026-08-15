// Módulo 4 · Recepción de carga en el CD.
// Chofer y pioneta la registran por separado antes de salir a ruta.
import { useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/Shell'
import MultiPhotoInput from '../components/MultiPhotoInput'
import { Badge, Button, Card, Field, Empty } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { store } from '../lib/store'
import { hoy, hora, num } from '../lib/format'

export default function CargoReception() {
  const { user } = useAuth()
  const nav = useNavigate()
  const db = useSyncExternalStore(store.subscribe, store.get)
  const [confirmed, setConfirmed] = useState(false)
  const [invoice, setInvoice] = useState('')
  const [dispatcher, setDispatcher] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [done, setDone] = useState(false)

  if (!user) return null
  const today = hoy()
  const assignment = db.route_assignments.find(a =>
    a.date === today && (a.driver_id === user.id || (user.truck_id && a.truck_id === user.truck_id)))
  const route = assignment ? db.routes.find(r => r.id === assignment.route_id) : null
  const stops = assignment
    ? db.delivery_stops.filter(s => s.route_assignment_id === assignment.id).sort((a, b) => a.stop_order - b.stop_order)
    : []
  const mine = assignment
    ? db.cargo_receptions.find(c => c.route_assignment_id === assignment.id && c.reported_by === user.id)
    : null

  if (!assignment || !route) {
    return (
      <Shell title="Recepción de carga">
        <Empty icon="📦" title="Sin ruta asignada para hoy" sub="La recepción se registra sobre la ruta del día." />
      </Shell>
    )
  }

  if (mine || done) {
    const rec = mine
    return (
      <Shell title="Recepción de carga">
        <div className="max-w-md mx-auto text-center pt-8">
          <div className="text-5xl mb-6">✅</div>
          <h2 className="t-title mb-2">Recepción registrada</h2>
          {rec && <p className="t-subhead mb-1">Factura {rec.invoice_number} · despachó {rec.dispatcher_name}</p>}
          {rec && <p className="t-footnote mb-8">{hora(rec.timestamp)} · {rec.photo_urls.length} foto{rec.photo_urls.length !== 1 ? 's' : ''}</p>}
          <Button full onClick={() => nav('/hoy')}>Ir a mi día</Button>
        </div>
      </Shell>
    )
  }

  const totalKg = stops.reduce((a, s) => a + s.planned_kg, 0)
  const canSubmit = confirmed && invoice.trim() && dispatcher.trim() && photos.length >= 1

  const submit = async () => {
    const { maybeUploadPhotos } = await import('../lib/remote')
    const uploaded = await maybeUploadPhotos('cargo-photos', photos)
    store.mutate(d => {
      d.cargo_receptions.push({
        id: store.uid(), route_assignment_id: assignment.id, reported_by: user.id,
        invoice_number: invoice.trim(), dispatcher_name: dispatcher.trim(),
        route_confirmed: true, photo_urls: uploaded, timestamp: new Date().toISOString(),
      })
    })
    setDone(true)
  }

  return (
    <Shell title="Recepción de carga">
      <div className="max-w-md mx-auto space-y-5">
        <Card>
          <div className="flex items-center justify-between mb-2">
            <span className="t-headline">{route.name}</span>
            <Badge tone="info">{num(totalKg)} kg</Badge>
          </div>
          <div className="space-y-1.5">
            {stops.map(s => (
              <div key={s.id} className="flex justify-between t-footnote">
                <span>{s.stop_order}. {s.client_name}</span>
                <span className="tnum">{num(s.planned_kg)} kg · {s.planned_items} bultos</span>
              </div>
            ))}
          </div>
        </Card>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="w-5 h-5 accent-[#F97316]" />
          <span className="t-headline">Confirmo que la ruta y las paradas son correctas</span>
        </label>

        <Field label="Número de factura (obligatorio)" value={invoice} onChange={e => setInvoice(e.target.value)} placeholder="F-000000" inputMode="numeric" />
        <Field label="Nombre del despachador CD (obligatorio)" value={dispatcher} onChange={e => setDispatcher(e.target.value)} placeholder="Nombre y apellido" />

        <MultiPhotoInput label="Fotos de la carga" photos={photos} onChange={setPhotos} min={1} max={4} />

        <Button full disabled={!canSubmit} onClick={submit}>Registrar recepción</Button>
        <p className="t-footnote text-center">Chofer y pioneta registran su recepción por separado. El administrador recibe la notificación en tiempo real.</p>
      </div>
    </Shell>
  )
}
