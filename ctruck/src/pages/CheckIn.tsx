// Módulos 1 y 2 · Check-in secuencial obligatorio.
// Chofer: aptitud → km → foto panel → foto cabina → firma.
// Pioneta: aptitud → firma.
import { useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/Shell'
import AptitudeWizard from '../components/AptitudeWizard'
import SignaturePad from '../components/SignaturePad'
import PhotoInput from '../components/PhotoInput'
import { Button, Card, Field, Badge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { store } from '../lib/store'
import { hoy, num } from '../lib/format'

type Phase = 'aptitude' | 'rejected' | 'km' | 'photo_dash' | 'photo_cabin' | 'sign' | 'done'

export default function CheckIn() {
  const { user } = useAuth()
  const nav = useNavigate()
  const db = useSyncExternalStore(store.subscribe, store.get)
  const [phase, setPhase] = useState<Phase>('aptitude')
  const [answers, setAnswers] = useState<boolean[]>([])
  const [kmInput, setKmInput] = useState('')
  const [kmError, setKmError] = useState<string | null>(null)
  const [kmWarn, setKmWarn] = useState(false)
  const [kmOk, setKmOk] = useState<number | null>(null)
  const [photoDash, setPhotoDash] = useState<string | null>(null)
  const [photoCabin, setPhotoCabin] = useState<string | null>(null)

  if (!user) return null
  const truck = db.trucks.find(t => t.id === user.truck_id)
  const isDriver = user.role === 'driver'

  const onAptitude = (apto: boolean, ans: boolean[]) => {
    setAnswers(ans)
    if (!apto) {
      // Clock-out automático: se registra el día no apto y termina el flujo.
      store.mutate(d => {
        d.daily_checkins.push({
          id: store.uid(), user_id: user.id, truck_id: user.truck_id, date: hoy(),
          role: user.role, aptitude_result: 'no_apto', aptitude_answers: ans,
          km_in: null, km_system: null, km_diff: null, km_warning: false,
          dashboard_photo_url: null, cabin_photo_url: null, signature_name: null,
          checkout_km: null, checkout_diff: null, checkout_warning: false,
          checkin_time: new Date().toISOString(), checkout_time: new Date().toISOString(),
        })
      })
      setPhase('rejected')
    } else {
      setPhase(isDriver ? 'km' : 'sign')
    }
  }

  const validateKm = () => {
    const km = parseInt(kmInput, 10)
    const system = truck?.current_km ?? 0
    if (isNaN(km)) return
    if (km < system) {
      setKmError(`El kilometraje no puede ser menor al del sistema (${num(system)} km). Revisa el odómetro.`)
      setKmWarn(false)
      return
    }
    setKmError(null)
    const diff = km - system
    if (diff > 500) {
      setKmWarn(true)
      store.mutate(d => {
        d.km_warnings.push({
          id: store.uid(), truck_id: truck!.id, driver_id: user.id,
          warning_type: 'checkin_discrepancy', km_diff: diff, acknowledged: false,
          created_at: new Date().toISOString(),
        })
      })
    } else {
      setKmWarn(false)
    }
    setKmOk(km)
    setPhase('photo_dash')
  }

  const finish = async () => {
    // Con Supabase: subir fotos al bucket checkin-photos (si falla queda la dataURL local)
    const { maybeUploadPhotos } = await import('../lib/remote')
    const [dashUrl, cabinUrl] = await maybeUploadPhotos('checkin-photos',
      [photoDash, photoCabin].filter((p): p is string => p !== null))
      .then(urls => [urls[0] ?? photoDash, urls[1] ?? photoCabin])
    store.mutate(d => {
      d.daily_checkins.push({
        id: store.uid(), user_id: user.id, truck_id: user.truck_id, date: hoy(),
        role: user.role, aptitude_result: 'apto', aptitude_answers: answers,
        km_in: kmOk, km_system: truck?.current_km ?? null,
        km_diff: kmOk !== null && truck ? kmOk - truck.current_km : null,
        km_warning: kmWarn,
        dashboard_photo_url: dashUrl, cabin_photo_url: cabinUrl,
        signature_name: user.name,
        checkout_km: null, checkout_diff: null, checkout_warning: false,
        checkin_time: new Date().toISOString(), checkout_time: null,
      })
      const a = d.route_assignments.find(x => x.driver_id === user.id && x.date === hoy())
      if (a && a.status === 'pendiente') a.status = 'en_curso'
    })
    setPhase('done')
  }

  const stepLabels: Record<Phase, string> = {
    aptitude: 'Check-in', rejected: '', km: 'Paso 5 · Kilometraje',
    photo_dash: 'Paso 6 · Foto del panel', photo_cabin: 'Paso 7 · Foto de cabina',
    sign: isDriver ? 'Paso 8 · Firma' : 'Firma', done: '',
  }

  return (
    <Shell title={stepLabels[phase] || undefined}>
      {phase === 'aptitude' && <AptitudeWizard onComplete={onAptitude} />}

      {phase === 'rejected' && (
        <div className="max-w-md mx-auto text-center pt-10">
          <div className="text-5xl mb-6">🛑</div>
          <h2 className="t-title mb-3">Día sin remuneración registrado</h2>
          <p className="t-body text-os-muted mb-2">Regresa a casa.</p>
          <p className="t-footnote mb-8">Tu supervisor fue notificado. Este registro queda guardado con fecha y hora.</p>
          <Button variant="secondary" full onClick={() => nav('/hoy')}>Entendido</Button>
        </div>
      )}

      {phase === 'km' && truck && (
        <div className="max-w-md mx-auto">
          <Card className="mb-5">
            <div className="flex justify-between items-baseline">
              <span className="t-caption">{truck.code} · {truck.plate}</span>
              <span className="t-footnote tnum">Sistema: {num(truck.current_km)} km</span>
            </div>
          </Card>
          <Field
            label="Odómetro actual" type="number" inputMode="numeric" placeholder="0"
            value={kmInput}
            onChange={e => { setKmInput(e.target.value); setKmError(null) }}
            className="text-center !text-[34px] font-extrabold tnum py-6"
            autoFocus
          />
          {kmError && (
            <div className="mt-3 rounded-os bg-danger/10 hairline px-4 py-3 text-[14px] text-danger font-medium">
              {kmError}
            </div>
          )}
          {!kmError && kmInput && parseInt(kmInput) - truck.current_km > 500 && (
            <div className="mt-3 rounded-os bg-warn/10 hairline px-4 py-3 text-[14px] text-warn font-medium">
              Diferencia de {num(parseInt(kmInput) - truck.current_km)} km con el sistema. Puedes continuar, pero se avisará al supervisor.
            </div>
          )}
          <Button full className="mt-5" disabled={!kmInput} onClick={validateKm}>Continuar</Button>
        </div>
      )}

      {phase === 'photo_dash' && (
        <div className="max-w-md mx-auto space-y-5">
          <PhotoInput label="Foto del panel / odómetro" onPhoto={setPhotoDash} />
          <Button full disabled={!photoDash} onClick={() => setPhase('photo_cabin')}>Continuar</Button>
        </div>
      )}

      {phase === 'photo_cabin' && (
        <div className="max-w-md mx-auto space-y-5">
          <PhotoInput label="Foto interior de la cabina" onPhoto={setPhotoCabin} />
          <Button full disabled={!photoCabin} onClick={() => setPhase('sign')}>Continuar</Button>
        </div>
      )}

      {phase === 'sign' && (
        <div className="max-w-md mx-auto">
          <Card className="mb-5">
            <div className="flex items-center justify-between">
              <span className="t-headline">Declaración de aptitud</span>
              <Badge tone="ok">Apto ✓</Badge>
            </div>
            {isDriver && kmOk !== null && (
              <div className="flex items-center justify-between mt-3">
                <span className="t-headline">Kilometraje</span>
                <span className="tnum t-headline">{num(kmOk)} km {kmWarn && '⚠️'}</span>
              </div>
            )}
          </Card>
          <SignaturePad name={user.name} onSign={finish} />
        </div>
      )}

      {phase === 'done' && (
        <div className="max-w-md mx-auto text-center pt-10">
          <div className="text-5xl mb-6">✅</div>
          <h2 className="t-title mb-3">Check-in completado</h2>
          <p className="t-subhead mb-8">Buen turno, {user.name.split(' ')[0]}.</p>
          <Button full onClick={() => nav('/hoy')}>Ver mi día</Button>
        </div>
      )}
    </Shell>
  )
}
