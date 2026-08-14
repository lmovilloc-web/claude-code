# CTruck 2.0 — Propuesta de mejora

**Fecha:** Agosto 2026
**Contexto:** CTruck v1 cubre la operación diaria (check-in con aptitud, kilometraje, recepción de carga, entregas, alertas de mantención, hoja de ruta PDF). Esta propuesta agrega la capa financiera y administrativa del negocio, más navegación gratuita para los choferes.

## Diagnóstico

- **No hay registro de gastos:** combustible, TAG, mantenciones y remuneraciones viven fuera del sistema; la merma de $350.000 CLP/mes se mide pero no se contrasta contra el costo total.
- **No hay P&L:** no se puede responder "¿cuánto ganó o perdió cada camión este mes?".
- **Perfiles y rutas se administran por SQL/seed**, no desde el panel.
- **Reportería reactiva:** nada llega solo al correo salvo la alerta roja de mantención.
- **Choferes sin apoyo de navegación:** las paradas son direcciones en texto.

---

## Fase 1 — Administración completa desde el panel (1–1,5 semanas)

### Tab Equipo → gestión de perfiles
- CRUD de usuarios (chofer, pioneta, supervisor, admin) con validación de RUT (módulo 11) y asignación a camión.
- Invitación por correo vía `supabase.auth.admin.inviteUserByEmail` desde Edge Function (service role nunca en el frontend).
- Historial por persona: check-ins, aptitud, warnings de km.

### Tab Rutas → carga de rutas
- Formulario de ruta con paradas (cliente, dirección, contacto, kg, bultos) y orden drag-and-drop.
- **Importación CSV/Excel** con vista previa y validación antes de confirmar.
- Plantillas reutilizables: duplicar la ruta de ayer en un clic.

### Bandeja de alertas unificada
- Todas las alertas (aptitud, km, mantención, incidentes) en una bandeja, ordenadas por severidad, con estado pendiente/reconocida/resuelta y responsable.
- Filtros por camión, tipo y fechas; contador de pendientes en el tab.

---

## Fase 2 — Módulo de gastos (1,5 semanas)

Nueva tabla `expenses` como fuente única de costos. Registro desde el panel y, para combustible/peajes, desde el celular del chofer con foto de boleta (mismo patrón offline-first del check-in).

```sql
create table expenses (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid references trucks(id),
  category text not null check (category in
    ('combustible','peaje_tag','mantencion','remuneraciones','merma','seguros','otros')),
  amount_clp int not null,
  expense_date date not null default current_date,
  description text,
  receipt_photo_url text,          -- bucket: expense-receipts
  reported_by uuid references users(id),
  route_assignment_id uuid references route_assignments(id),
  created_at timestamptz default now()
);

create table revenues (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid references trucks(id),
  route_assignment_id uuid references route_assignments(id),
  concept text not null,           -- flete, arriendo, otro
  amount_clp int not null,
  revenue_date date not null,
  invoice_number text,
  created_at timestamptz default now()
);
```

### Tab Gastos (nuevo)
- Tabla con filtros por camión, categoría y período; totales por categoría y gráfico mensual apilado.
- **Costo por km real:** gastos del período ÷ km recorridos (los km ya existen por check-in/check-out).
- La merma entra como gasto categoría `merma` vía trigger desde los incidentes de entrega valorizados (sin doble digitación).

---

## Fase 3 — P&L del negocio (1 semana)

Tab nuevo con estado de resultados mensual, consolidado y por camión, construido como vista SQL sobre `revenues` y `expenses`.

- Ingresos por flete − combustible − peajes − remuneraciones − mantención − merma = resultado y margen por camión.
- Semáforo: camión con margen bajo umbral configurable se marca amarillo/rojo.
- Comparativa vs mes anterior y vs mismo mes del año pasado.
- Costo por km y por kg transportado (kg ya están en `delivery_stops`).
- Exportable a PDF con jsPDF (reutiliza el pipeline de la Hoja de Ruta).

---

## Fase 4 — Consolidado semanal de gastos por correo (0,5 semana)

Lunes 07:00 (Chile) llega al admin: total por categoría, comparación vs semana anterior, top 3 gastos, warnings de km y estado de mantenciones. Stack ya previsto (Edge Functions + Resend), agendado con `pg_cron`:

```sql
select cron.schedule(
  'resumen-semanal-gastos',
  '0 11 * * 1',  -- lunes 11:00 UTC ≈ 07:00 Chile (invierno; 08:00 en verano)
  $$ select net.http_post(
       url := 'https://<proyecto>.supabase.co/functions/v1/weekly-expense-report',
       headers := jsonb_build_object('Authorization', 'Bearer ' || vault_secret)
     ) $$
);
```

- La Edge Function arma el HTML del correo y adjunta el PDF (guardado también en bucket `route-sheets`).
- Destinatarios configurables desde el panel (`report_subscriptions`).
- El mismo mecanismo queda listo para un futuro resumen mensual de P&L.

---

## Fase 5 — Google Maps gratis para choferes (0,5–1 semana, costo $0)

### 1. Navegación del chofer: deep links a la app de Google Maps (gratis, sin API key)

Los *Maps URLs* de Google son gratuitos e ilimitados:

```ts
// Navegar a la siguiente parada
const navUrl = `https://www.google.com/maps/dir/?api=1` +
  `&destination=${encodeURIComponent(stop.address)}&travelmode=driving`;

// Ruta completa del día con waypoints (hasta 9 paradas intermedias)
const fullRoute = `https://www.google.com/maps/dir/?api=1` +
  `&origin=Centro+de+Distribución+Santiago` +
  `&destination=${lastStop}` +
  `&waypoints=${stops.map(encodeURIComponent).join('|')}`;
```

- Botón **"Navegar"** en cada parada del Módulo 5: abre la app nativa, el chofer conduce y al volver registra la entrega.
- Botón **"Ver ruta del día"** al terminar la recepción de carga.
- El link se genera localmente (compatible con offline-first); Google Maps maneja su propio caché.
- Requisito: agregar `lat/lng` opcionales a `delivery_stops` y usar `routes.waypoints` para mayor precisión.

### 2. Mapa en el panel admin: Leaflet + OpenStreetMap (gratis)
- Visualización de rutas/paradas en Tab Rutas sin costo ni API key.
- Marcadores por estado (pendiente/entregada/incidente) con Supabase Realtime.

### 3. Opcional futuro: Google en el panel
- **Maps Embed API**: gratuita e ilimitada (requiere API key, no genera cobros).
- API JavaScript: 10.000 cargas gratis/mes por SKU (precios desde marzo 2025); suficiente para esta escala pero exige tarjeta, por eso queda opcional.

---

## Fase 6 — Trazabilidad GPS y control de tiempos por parada (1 semana)

### ¿Se pueden capturar los km recorridos con el link de Google Maps?

**No.** El deep link abre la app de Google Maps y no devuelve ningún dato a CTruck. Pero no hace falta: el celular del chofer puede registrar el recorrido con su GPS, gratis, usando la Geolocation API mientras CTruck está abierto.

```ts
// Al iniciar la ruta: registrar puntos GPS cada ~30 s
const watchId = navigator.geolocation.watchPosition(pos => {
  guardarPunto(pos.coords.latitude, pos.coords.longitude, pos.timestamp);
}, onError, { enableHighAccuracy: true, maximumAge: 30000 });
// km recorridos = suma de distancias haversine entre puntos consecutivos
```

- Nueva tabla `route_tracks` (route_assignment_id, lat, lng, timestamp), offline-first: puntos en IndexedDB, sync al recuperar señal.
- **El odómetro sigue siendo la fuente oficial de km** (check-in/check-out); el GPS aporta trazabilidad: recorrido en mapa, desvíos y contraste km GPS vs km odómetro.
- **Limitación honesta:** los navegadores móviles pausan el GPS en segundo plano (p. ej. mientras Google Maps navega); el registro se reanuda al volver a CTruck. Para GPS continuo en background se necesitaría empaquetar la PWA con Capacitor (gratis, mismo código) — opcional futuro.

### Cronómetro por parada con alertas cada 15 minutos

Flujo: al llegar, el chofer/pioneta marca **"Llegué"** (clock-in de parada, con punto GPS); corre un cronómetro visible; al marcar **"Me voy"** se cierra la visita (clock-out de parada).

```sql
create table stop_visits (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid references delivery_stops(id),
  route_assignment_id uuid references route_assignments(id),
  arrived_at timestamptz not null,
  departed_at timestamptz,          -- null = todavía en la parada
  arrival_lat float8, arrival_lng float8,
  dwell_minutes int generated always as
    (extract(epoch from (departed_at - arrived_at))/60) stored,
  reported_by uuid references users(id)
);

create table stop_dwell_alerts (
  id uuid primary key default gen_random_uuid(),
  stop_visit_id uuid references stop_visits(id),
  minutes_elapsed int not null,     -- 15, 30, 45…
  notified_at timestamptz default now(),
  acknowledged boolean default false
);
```

- **Alerta local al chofer:** el cronómetro vibra/notifica a los 15, 30, 45… min, calculado en el dispositivo — funciona sin señal.
- **Alerta al supervisor:** job `pg_cron` cada 5 min busca visitas abiertas (`departed_at is null`) que cruzaron un múltiplo de 15 min sin alerta, inserta en `stop_dwell_alerts` y dispara Web Push. Server-side: funciona aunque el chofer pierda señal o cierre la app.
- El tiempo por parada alimenta el dashboard: promedio por cliente, paradas problemáticas, comparación entre choferes — insumo para renegociar ventanas de descarga.
- "Llegué"/"Me voy" se integra al bloqueo secuencial de paradas: la siguiente se desbloquea al cerrar la visita anterior.

---

## Seguridad y datos

- RLS en `expenses`/`revenues`: admin todo; supervisor su flota; chofer solo inserta combustible/peaje de su camión y ve lo propio.
- Nueva tabla `report_subscriptions` (usuario, tipo de reporte, activo).
- Columnas nuevas: `delivery_stops.lat/lng`, `users.email`, `users.active`.
- Bucket nuevo: `expense-receipts` (misma política por rol que `checkin-photos`).

## Plan y esfuerzo

| Fase | Entregable | Esfuerzo | Depende de |
|------|-----------|----------|------------|
| 1 | Perfiles, carga de rutas (CSV), bandeja de alertas | 1–1,5 sem | — |
| 2 | Módulo de gastos + registro móvil con boleta | 1,5 sem | — |
| 3 | P&L por camión y consolidado | 1 sem | Fase 2 |
| 4 | Correo semanal automático | 0,5 sem | Fase 2 |
| 5 | Google Maps (deep links + mapa admin) | 0,5–1 sem | — |
| 6 | Trazabilidad GPS + cronómetro por parada con alertas | 1 sem | Fase 5 |

Fases 1, 2 y 5 pueden partir en paralelo. **Total estimado: 5–6 semanas.**
