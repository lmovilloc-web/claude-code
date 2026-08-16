// Gestión desde el panel: empresas (Super Admin), perfiles del equipo,
// camiones, rutas, paradas y gastos. Fase 1 completa.
import { useState, useSyncExternalStore } from 'react'
import { Badge, Button, Card, Empty, Field } from '../components/ui'
import { roleLabel } from '../components/Shell'
import { store } from '../lib/store'
import { clp, formateaRut, hoy, num, validaRut } from '../lib/format'
import { createUser } from '../lib/remote'
import { useAuth } from '../context/AuthContext'
import type { ExpenseCategory, Role } from '../lib/types'

const selectCls = 'w-full bg-os-card2 hairline rounded-os px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-accent/60'

function genPassword() {
  const words = ['camion', 'ruta', 'frio', 'carga', 'norte', 'sur']
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.random().toString(36).slice(2, 8)}`
}

/* ─── Empresas (solo Super Admin) ─────────────────────────── */
export function EmpresasTab() {
  const db = useSyncExternalStore(store.subscribe, store.get)
  const [name, setName] = useState('')
  const [rut, setRut] = useState('')

  const add = () => {
    store.mutate(d => { d.companies.push({ id: store.uid(), name: name.trim(), rut: rut.trim() || null }) })
    setName(''); setRut('')
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="t-headline mb-4">Nueva empresa</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Razón social" value={name} onChange={e => setName(e.target.value)} placeholder="Transportes XYZ SpA" />
          <Field label="RUT empresa (opcional)" value={rut} onChange={e => setRut(e.target.value)} placeholder="76.543.210-K" />
          <div className="flex items-end"><Button full disabled={!name.trim()} onClick={add}>Crear empresa</Button></div>
        </div>
      </Card>
      {db.companies.length === 0
        ? <Empty icon="🏢" title="Sin empresas todavía" sub="Crea la primera para poder asignarle un administrador." />
        : (
          <Card pad={false}>
            {db.companies.map((c, i) => {
              const nUsers = db.users.filter(u => u.company_id === c.id && u.active).length
              const nTrucks = db.trucks.filter(t => t.company_id === c.id).length
              return (
                <div key={c.id} className={`flex items-center justify-between gap-3 px-5 py-4 flex-wrap ${i > 0 ? 'border-t border-os-border' : ''}`}>
                  <div>
                    <div className="t-headline">{c.name}</div>
                    <div className="t-footnote">{c.rut ?? 'sin RUT'} · {nUsers} persona{nUsers !== 1 ? 's' : ''} · {nTrucks} camion{nTrucks !== 1 ? 'es' : ''}</div>
                  </div>
                  <Badge tone="info">Empresa</Badge>
                </div>
              )
            })}
          </Card>
        )}
    </div>
  )
}

/* ─── Equipo · CRUD de perfiles ───────────────────────────── */
export function EquipoTab() {
  const { user: me } = useAuth()
  const db = useSyncExternalStore(store.subscribe, store.get)
  const isSuper = me?.role === 'super_admin'
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const roleOptions: Role[] = isSuper ? ['admin', 'supervisor', 'driver', 'helper'] : ['supervisor', 'driver', 'helper']
  const [form, setForm] = useState({
    name: '', rut: '', email: '', password: genPassword(),
    role: roleOptions[0] as Role, company_id: '', truck_id: '',
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const companyId = isSuper ? form.company_id : (me?.company_id ?? '')
  const companyTrucks = db.trucks.filter(t => !companyId || t.company_id === companyId)
  const rutOk = !form.rut || validaRut(form.rut)
  const canSubmit = form.name.trim() && form.email.includes('@') && form.password.length >= 8 && rutOk
    && (form.role === 'super_admin' || !!companyId)

  const submit = async () => {
    setBusy(true); setError(null); setOkMsg(null)
    const res = await createUser({
      name: form.name.trim(), rut: form.rut ? formateaRut(form.rut) : '', email: form.email.trim().toLowerCase(),
      password: form.password, role: form.role,
      company_id: companyId || null,
      truck_id: ['driver', 'helper'].includes(form.role) ? (form.truck_id || null) : null,
    })
    setBusy(false)
    if (res.error) { setError(res.error); return }
    setOkMsg(`${form.name.trim()} creado. Credenciales: ${form.email.trim().toLowerCase()} / ${form.password} — compártelas por un canal seguro.`)
    setForm({ name: '', rut: '', email: '', password: genPassword(), role: roleOptions[0], company_id: '', truck_id: '' })
    setOpen(false)
  }

  const toggleActive = (id: string) =>
    store.mutate(d => { const u = d.users.find(u => u.id === id); if (u) u.active = !u.active })

  const setTruck = (id: string, truckId: string) =>
    store.mutate(d => { const u = d.users.find(u => u.id === id); if (u) u.truck_id = truckId || null })

  const companyName = (id?: string | null) => db.companies.find(c => c.id === id)?.name

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="t-subhead">
          {isSuper
            ? 'Como Super Admin creas administradores y los asignas a una empresa. Cada admin gestiona su propio equipo.'
            : 'Crea supervisores, choferes y pionetas para tu empresa.'}
        </p>
        <Button onClick={() => { setOpen(!open); setOkMsg(null) }}>{open ? 'Cancelar' : '+ Agregar persona'}</Button>
      </div>

      {okMsg && (
        <div className="rounded-os bg-ok/10 hairline px-4 py-3 text-[14px] text-ok font-medium">{okMsg}</div>
      )}

      {open && (
        <Card>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nombre completo" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre y apellido" />
            <Field label="RUT" value={form.rut} onChange={e => set('rut', e.target.value)} placeholder="12.345.678-9"
              hint={form.rut && !rutOk ? 'RUT inválido (dígito verificador no calza)' : undefined} />
            <Field label="Correo" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="persona@empresa.cl" />
            <Field label="Contraseña temporal (mín. 8)" value={form.password} onChange={e => set('password', e.target.value)} />
            <label className="block">
              <span className="t-caption block mb-2">Rol</span>
              <select className={selectCls} value={form.role} onChange={e => set('role', e.target.value)}>
                {roleOptions.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </label>
            {isSuper && (
              <label className="block">
                <span className="t-caption block mb-2">Empresa</span>
                <select className={selectCls} value={form.company_id} onChange={e => set('company_id', e.target.value)}>
                  <option value="">— Elegir empresa —</option>
                  {db.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {['driver', 'helper'].includes(form.role) && (
              <label className="block">
                <span className="t-caption block mb-2">Camión asignado</span>
                <select className={selectCls} value={form.truck_id} onChange={e => set('truck_id', e.target.value)}>
                  <option value="">— Sin camión aún —</option>
                  {companyTrucks.map(t => <option key={t.id} value={t.id}>{t.code} · {t.plate}</option>)}
                </select>
              </label>
            )}
          </div>
          {isSuper && db.companies.length === 0 && (
            <p className="t-footnote text-warn mt-3">Primero crea una empresa en el tab Empresas.</p>
          )}
          {error && <div className="mt-4 rounded-os bg-danger/10 hairline px-4 py-3 text-[14px] text-danger font-medium">{error}</div>}
          <Button full className="mt-5" disabled={!canSubmit || busy} onClick={submit}>
            {busy ? 'Creando…' : 'Crear perfil y cuenta de acceso'}
          </Button>
        </Card>
      )}

      {db.users.length === 0
        ? <Empty icon="👥" title="Sin personas registradas" />
        : (
          <Card pad={false}>
            {db.users.map((u, i) => (
              <div key={u.id} className={`flex items-center justify-between gap-3 px-5 py-4 flex-wrap ${i > 0 ? 'border-t border-os-border' : ''} ${!u.active ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <div className="t-headline">{u.name} {u.id === me?.id && <span className="t-footnote">(tú)</span>}</div>
                  <div className="t-footnote">
                    {roleLabel(u.role)}{companyName(u.company_id) ? ` · ${companyName(u.company_id)}` : ''}{u.email ? ` · ${u.email}` : ''}{u.rut ? ` · ${u.rut}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {['driver', 'helper'].includes(u.role) && (
                    <select
                      className="bg-os-card2 hairline rounded-full px-3 py-1.5 text-[13px] font-semibold outline-none"
                      value={u.truck_id ?? ''}
                      onChange={e => setTruck(u.id, e.target.value)}
                    >
                      <option value="">Sin camión</option>
                      {db.trucks.filter(t => !u.company_id || t.company_id === u.company_id).map(t =>
                        <option key={t.id} value={t.id}>{t.code}</option>)}
                    </select>
                  )}
                  {u.id !== me?.id && u.role !== 'super_admin' && (
                    <button
                      onClick={() => toggleActive(u.id)}
                      className={`os-t pressable rounded-full px-3.5 py-1.5 text-[13px] font-semibold hairline ${u.active ? 'text-os-muted hover:text-danger' : 'text-ok'}`}
                    >
                      {u.active ? 'Desactivar' : 'Reactivar'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
    </div>
  )
}

/* ─── Formularios de alta: camión, ruta, gasto ────────────── */
export function TruckForm() {
  const { user: me } = useAuth()
  const db = useSyncExternalStore(store.subscribe, store.get)
  const isSuper = me?.role === 'super_admin'
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ code: '', plate: '', km: '', next: '', company_id: '' })
  const companyId = isSuper ? f.company_id : (me?.company_id ?? '')
  const ok = f.code.trim() && f.plate.trim() && f.km !== '' && f.next !== '' && !!companyId
    && parseInt(f.next) > parseInt(f.km)

  const add = () => {
    store.mutate(d => {
      d.trucks.push({
        id: store.uid(), code: f.code.trim().toUpperCase(), plate: f.plate.trim().toUpperCase(),
        current_km: parseInt(f.km), next_maintenance_km: parseInt(f.next),
        status: 'operativo', company_id: companyId,
      })
    })
    setF({ code: '', plate: '', km: '', next: '', company_id: '' }); setOpen(false)
  }

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between">
        <h2 className="t-headline">Flota</h2>
        <Button variant="secondary" className="!py-2 !text-[14px]" onClick={() => setOpen(!open)}>{open ? 'Cancelar' : '+ Agregar camión'}</Button>
      </div>
      {open && (
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <Field label="Código interno" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="CTR-001" />
          <Field label="Patente" value={f.plate} onChange={e => setF({ ...f, plate: e.target.value })} placeholder="ABCD-12" />
          <Field label="Kilometraje actual" type="number" inputMode="numeric" value={f.km} onChange={e => setF({ ...f, km: e.target.value })} placeholder="0" />
          <Field label="Próxima mantención (km)" type="number" inputMode="numeric" value={f.next} onChange={e => setF({ ...f, next: e.target.value })} placeholder="10000"
            hint={f.km && f.next && parseInt(f.next) <= parseInt(f.km) ? 'Debe ser mayor al km actual' : undefined} />
          {isSuper && (
            <label className="block sm:col-span-2">
              <span className="t-caption block mb-2">Empresa</span>
              <select className={selectCls} value={f.company_id} onChange={e => setF({ ...f, company_id: e.target.value })}>
                <option value="">— Elegir empresa —</option>
                {db.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <div className="sm:col-span-2"><Button full disabled={!ok} onClick={add}>Agregar camión</Button></div>
        </div>
      )}
    </Card>
  )
}

export function RouteForm() {
  const { user: me } = useAuth()
  const db = useSyncExternalStore(store.subscribe, store.get)
  const isSuper = me?.role === 'super_admin'
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', origin: '', destination: '', km: '', toll: '', company_id: '' })
  const companyId = isSuper ? f.company_id : (me?.company_id ?? '')
  const ok = f.name.trim() && f.origin.trim() && f.destination.trim() && f.km !== '' && !!companyId

  const add = () => {
    store.mutate(d => {
      d.routes.push({
        id: store.uid(), name: f.name.trim(), origin: f.origin.trim(), destination: f.destination.trim(),
        planned_km: parseInt(f.km), has_toll: !!parseInt(f.toll || '0'), toll_cost: parseInt(f.toll || '0'),
        company_id: companyId,
      })
    })
    setF({ name: '', origin: '', destination: '', km: '', toll: '', company_id: '' }); setOpen(false)
  }

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between">
        <h2 className="t-headline">Rutas</h2>
        <Button variant="secondary" className="!py-2 !text-[14px]" onClick={() => setOpen(!open)}>{open ? 'Cancelar' : '+ Crear ruta'}</Button>
      </div>
      {open && (
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <Field label="Nombre" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Santiago → Valparaíso" className="sm:col-span-2" />
          <Field label="Origen" value={f.origin} onChange={e => setF({ ...f, origin: e.target.value })} placeholder="CD Santiago" />
          <Field label="Destino" value={f.destination} onChange={e => setF({ ...f, destination: e.target.value })} placeholder="Valparaíso" />
          <Field label="Km planificados" type="number" inputMode="numeric" value={f.km} onChange={e => setF({ ...f, km: e.target.value })} placeholder="240" />
          <Field label="Costo peaje TAG (CLP, 0 si no tiene)" type="number" inputMode="numeric" value={f.toll} onChange={e => setF({ ...f, toll: e.target.value })} placeholder="12400" />
          {isSuper && (
            <label className="block sm:col-span-2">
              <span className="t-caption block mb-2">Empresa</span>
              <select className={selectCls} value={f.company_id} onChange={e => setF({ ...f, company_id: e.target.value })}>
                <option value="">— Elegir empresa —</option>
                {db.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <div className="sm:col-span-2"><Button full disabled={!ok} onClick={add}>Crear ruta</Button></div>
        </div>
      )}
    </Card>
  )
}

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'combustible', label: 'Combustible' }, { value: 'peaje_tag', label: 'Peajes / TAG' },
  { value: 'mantencion', label: 'Mantención' }, { value: 'remuneraciones', label: 'Remuneraciones' },
  { value: 'merma', label: 'Merma' }, { value: 'seguros', label: 'Seguros' }, { value: 'otros', label: 'Otros' },
]

export function ExpenseForm() {
  const db = useSyncExternalStore(store.subscribe, store.get)
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ category: 'combustible' as ExpenseCategory, amount: '', date: hoy(), truck_id: '', desc: '' })
  const ok = f.amount !== '' && parseInt(f.amount) > 0

  const add = () => {
    store.mutate(d => {
      d.expenses.push({
        id: store.uid(), truck_id: f.truck_id || null, category: f.category,
        amount_clp: parseInt(f.amount), expense_date: f.date, description: f.desc.trim() || null,
      })
    })
    setF({ category: f.category, amount: '', date: hoy(), truck_id: '', desc: '' }); setOpen(false)
  }

  return (
    <Card className="mb-2">
      <div className="flex items-center justify-between">
        <h2 className="t-headline">Registro de gastos</h2>
        <Button variant="secondary" className="!py-2 !text-[14px]" onClick={() => setOpen(!open)}>{open ? 'Cancelar' : '+ Agregar gasto'}</Button>
      </div>
      {open && (
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="t-caption block mb-2">Categoría</span>
            <select className={selectCls} value={f.category} onChange={e => setF({ ...f, category: e.target.value as ExpenseCategory })}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <Field label="Monto (CLP)" type="number" inputMode="numeric" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder="50000"
            hint={f.amount ? clp(parseInt(f.amount) || 0) : undefined} />
          <Field label="Fecha" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
          <label className="block">
            <span className="t-caption block mb-2">Camión (opcional)</span>
            <select className={selectCls} value={f.truck_id} onChange={e => setF({ ...f, truck_id: e.target.value })}>
              <option value="">Gasto general</option>
              {db.trucks.map(t => <option key={t.id} value={t.id}>{t.code}</option>)}
            </select>
          </label>
          <Field label="Descripción (opcional)" value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} placeholder="Detalle del gasto" className="sm:col-span-2" />
          <div className="sm:col-span-2"><Button full disabled={!ok} onClick={add}>Registrar gasto</Button></div>
        </div>
      )}
    </Card>
  )
}

/* ─── Paradas por asignación ──────────────────────────────── */
export function StopsEditor({ assignmentId }: { assignmentId: string }) {
  const db = useSyncExternalStore(store.subscribe, store.get)
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ client: '', address: '', contact: '', phone: '', kg: '', items: '' })
  const stops = db.delivery_stops.filter(s => s.route_assignment_id === assignmentId).sort((a, b) => a.stop_order - b.stop_order)
  const ok = f.client.trim() && f.address.trim()

  const add = () => {
    store.mutate(d => {
      d.delivery_stops.push({
        id: store.uid(), route_assignment_id: assignmentId, stop_order: stops.length + 1,
        client_name: f.client.trim(), address: f.address.trim(),
        contact_name: f.contact.trim(), contact_phone: f.phone.trim(),
        planned_kg: parseInt(f.kg || '0'), planned_items: parseInt(f.items || '0'), lat: null, lng: null,
      })
    })
    setF({ client: '', address: '', contact: '', phone: '', kg: '', items: '' })
  }

  const remove = (id: string) => {
    store.mutate(d => {
      d.delivery_stops = d.delivery_stops.filter(s => s.id !== id)
      d.delivery_stops.filter(s => s.route_assignment_id === assignmentId)
        .sort((a, b) => a.stop_order - b.stop_order)
        .forEach((s, i) => { s.stop_order = i + 1 })
    })
  }

  return (
    <div className="mt-3 pt-3 border-t border-os-border">
      <div className="flex items-center justify-between">
        <span className="t-caption">{stops.length} parada{stops.length !== 1 ? 's' : ''} · {num(stops.reduce((a, s) => a + s.planned_kg, 0))} kg</span>
        <button className="t-footnote text-accent font-semibold" onClick={() => setOpen(!open)}>{open ? 'Cerrar' : 'Editar paradas'}</button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          {stops.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-2 bg-os-card2 rounded-os px-3.5 py-2.5">
              <div className="t-footnote min-w-0 truncate">
                <span className="font-semibold text-os-text">{s.stop_order}. {s.client_name}</span> · {s.address} · {num(s.planned_kg)} kg
              </div>
              <button className="t-footnote text-danger font-semibold shrink-0" onClick={() => remove(s.id)}>Quitar</button>
            </div>
          ))}
          <div className="grid sm:grid-cols-2 gap-2 pt-2">
            <Field placeholder="Cliente *" value={f.client} onChange={e => setF({ ...f, client: e.target.value })} />
            <Field placeholder="Dirección *" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} />
            <Field placeholder="Contacto" value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} />
            <Field placeholder="Teléfono" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
            <Field placeholder="Kg" type="number" inputMode="numeric" value={f.kg} onChange={e => setF({ ...f, kg: e.target.value })} />
            <Field placeholder="Bultos" type="number" inputMode="numeric" value={f.items} onChange={e => setF({ ...f, items: e.target.value })} />
          </div>
          <Button variant="secondary" full className="!py-2.5" disabled={!ok} onClick={add}>+ Agregar parada</Button>
        </div>
      )}
    </div>
  )
}
