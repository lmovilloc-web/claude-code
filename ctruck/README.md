# CTruck · Control Truck

Gestión de flota de transporte refrigerado (Santiago → V Región), corriendo sobre **Truck OS 1.0** — sistema de diseño oscuro industrial con tratamiento Apple: superficies translúcidas, hairlines, tipografía del sistema y controles pill.

## Stack

React 18 + TypeScript + Vite + TailwindCSS + Supabase.

## Correr en local

```bash
npm install
npm run dev
```

Sin credenciales de Supabase la app corre en **Modo Demo**: datos seed en localStorage (4 camiones CTR-001…004, choferes, pionetas y rutas a V Región), con todos los flujos operativos.

## Producción (Supabase)

El proyecto vive en Supabase (`ctruck`, región `sa-east-1`, ref `vzjzdalsrcvfsjeoxavp`) con las migraciones de `supabase/migrations/` ya aplicadas (esquema → RLS → seed → storage/realtime). `.env.example` trae las credenciales públicas (la seguridad la da RLS); copiar a `.env` y compilar.

Acceso del equipo: correo `<nombre>@ctruck.cl` con contraseña temporal compartida — **cambiarla desde el dashboard de Supabase (Authentication → Users) antes de usar en producción**.

Arquitectura de sincronización (`src/lib/remote.ts`): la UI siempre lee el store local (offline-first); al iniciar sesión se hidrata desde Supabase, cada cambio local se empuja con diff por id (insert/update según RLS) con reintento al recuperar conexión, y Realtime aplica los cambios de otros dispositivos al instante. Las fotos suben a los buckets (`checkin-photos`, `cargo-photos`) y si no hay señal quedan como dataURL local hasta el próximo intento. Admin/supervisor reciben notificaciones del navegador ante: NO APTO, avisos de km, mantención roja, incidentes de entrega y recepciones de carga.

## Qué está implementado (v0.1)

- **Truck OS**: sistema de diseño completo (tokens, tipografía SF, componentes pill/card/segmented).
- **Check-in chofer** (Módulo 1): 4 preguntas de aptitud una a una, clock-out automático si alguna es NO ("Día sin remuneración registrado"), kilometraje validado contra el sistema (error si es menor, warning >500 km), foto panel + foto cabina, firma digital con timestamp.
- **Check-in pioneta** (Módulo 2): aptitud + firma.
- **Check-out** (Módulo 3): km final, tolerancia ±30 km vs ruta, warning al supervisor, actualiza `trucks.current_km` y dispara alertas de mantención (≤3000 amarilla, ≤1000 roja).
- **Mi día + entregas** (Módulo 5): paradas bloqueadas en orden, registro de entrega con receptor/RUT/incidente/notas, y **Fase 6**: botón "Llegué" con cronómetro de permanencia y aviso local cada 15 minutos, botón "Navegar" y "Ver ruta completa" con deep links gratuitos de Google Maps.
- **Panel admin** (Módulo 6): Resumen (KPIs + alertas por severidad + estado flota), Flota (barras de mantención con umbrales), Rutas (asignación diaria + comparativa TAG vs sin peaje), **Gastos** (Fase 2: distribución por categoría y filtros por camión), **P&L** (Fase 3: estado de resultados por camión con margen), Equipo (estado de check-in del día).
- **Migraciones Supabase**: esquema completo (incluye `expenses`, `revenues`, `stop_visits`, `route_tracks`, `report_subscriptions`, vista `pnl_monthly`), RLS por rol y seed.

## Pendiente (siguientes iteraciones)

- Conexión Supabase real (auth email + password, Storage, Realtime) — la capa de datos ya está aislada en `src/lib/store.ts` para el swap.
- Recepción de carga (Módulo 4), hoja de ruta PDF (jsPDF), Web Push, correo semanal (Edge Function + Resend + pg_cron), offline-first con IndexedDB, CRUD de perfiles y carga CSV de rutas desde el panel.
