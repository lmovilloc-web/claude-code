-- CTruck · Esquema base (Fases 1-6)

create table trucks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  plate text not null,
  current_km int not null default 0,
  next_maintenance_km int not null,
  status text not null default 'operativo' check (status in ('operativo','mantencion','detenido')),
  created_at timestamptz default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id),
  name text not null,
  rut text not null,
  email text,
  role text not null check (role in ('admin','supervisor','driver','helper')),
  truck_id uuid references trucks(id),
  active boolean not null default true,
  created_at timestamptz default now()
);

create table daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  truck_id uuid references trucks(id),
  date date not null default current_date,
  role text not null,
  aptitude_result text not null check (aptitude_result in ('apto','no_apto')),
  aptitude_answers jsonb not null,
  km_in int, km_system int, km_diff int,
  km_warning boolean default false,
  dashboard_photo_url text,
  cabin_photo_url text,
  signature_name text,
  checkout_km int, checkout_diff int,
  checkout_warning boolean default false,
  checkin_time timestamptz default now(),
  checkout_time timestamptz,
  unique (user_id, date)
);

create table routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  origin text not null,
  destination text not null,
  planned_km int not null,
  has_toll boolean default false,
  toll_cost int default 0,
  waypoints jsonb
);

create table route_assignments (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id),
  truck_id uuid not null references trucks(id),
  driver_id uuid not null references users(id),
  date date not null,
  status text not null default 'pendiente' check (status in ('pendiente','en_curso','completada')),
  unique (truck_id, date)
);

create table cargo_receptions (
  id uuid primary key default gen_random_uuid(),
  route_assignment_id uuid not null references route_assignments(id),
  reported_by uuid not null references users(id),
  invoice_number text not null,
  dispatcher_name text not null,
  route_confirmed boolean not null default false,
  photo_urls jsonb,
  timestamp timestamptz default now()
);

create table delivery_stops (
  id uuid primary key default gen_random_uuid(),
  route_assignment_id uuid not null references route_assignments(id),
  stop_order int not null,
  client_name text not null,
  address text not null,
  contact_name text,
  contact_phone text,
  planned_kg int default 0,
  planned_items int default 0,
  lat float8, lng float8
);

create table delivery_records (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references delivery_stops(id),
  reported_by uuid not null references users(id),
  recipient_name text not null,
  recipient_rut text,
  photo_urls jsonb,
  has_issue boolean default false,
  issue_type text,
  notes text,
  timestamp timestamptz default now()
);

create table maintenance_alerts (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references trucks(id),
  alert_type text not null check (alert_type in ('yellow_3000','red_1000')),
  km_remaining int not null,
  acknowledged boolean default false,
  acknowledged_by uuid references users(id),
  created_at timestamptz default now()
);

create table km_warnings (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references trucks(id),
  driver_id uuid not null references users(id),
  warning_type text not null check (warning_type in ('checkin_discrepancy','checkout_excess')),
  km_in int, km_out int, km_traveled int, km_planned int, km_diff int,
  acknowledged boolean default false,
  created_at timestamptz default now()
);

-- Fase 2 · Gastos e ingresos
create table expenses (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid references trucks(id),
  category text not null check (category in
    ('combustible','peaje_tag','mantencion','remuneraciones','merma','seguros','otros')),
  amount_clp int not null,
  expense_date date not null default current_date,
  description text,
  receipt_photo_url text,
  reported_by uuid references users(id),
  route_assignment_id uuid references route_assignments(id),
  created_at timestamptz default now()
);

create table revenues (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid references trucks(id),
  route_assignment_id uuid references route_assignments(id),
  concept text not null,
  amount_clp int not null,
  revenue_date date not null,
  invoice_number text,
  created_at timestamptz default now()
);

-- Fase 4 · Suscripciones a reportes por correo
create table report_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  report_type text not null check (report_type in ('gastos_semanal','pnl_mensual','resumen_diario')),
  active boolean default true
);

-- Fase 6 · Trazabilidad GPS y tiempos por parada
create table route_tracks (
  id uuid primary key default gen_random_uuid(),
  route_assignment_id uuid not null references route_assignments(id),
  lat float8 not null,
  lng float8 not null,
  recorded_at timestamptz not null
);

create table stop_visits (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references delivery_stops(id),
  route_assignment_id uuid references route_assignments(id),
  arrived_at timestamptz not null default now(),
  departed_at timestamptz,
  arrival_lat float8, arrival_lng float8,
  dwell_minutes int generated always as
    (cast(extract(epoch from (departed_at - arrived_at))/60 as int)) stored,
  reported_by uuid references users(id)
);

create table stop_dwell_alerts (
  id uuid primary key default gen_random_uuid(),
  stop_visit_id uuid not null references stop_visits(id),
  minutes_elapsed int not null,
  notified_at timestamptz default now(),
  acknowledged boolean default false
);

-- Vista P&L mensual por camión
create view pnl_monthly as
select
  coalesce(e.truck_id, r.truck_id) as truck_id,
  coalesce(e.month, r.month) as month,
  coalesce(r.ingresos, 0) as ingresos_clp,
  coalesce(e.gastos, 0) as gastos_clp,
  coalesce(r.ingresos, 0) - coalesce(e.gastos, 0) as resultado_clp
from
  (select truck_id, to_char(expense_date, 'YYYY-MM') as month, sum(amount_clp) as gastos
   from expenses group by 1, 2) e
full outer join
  (select truck_id, to_char(revenue_date, 'YYYY-MM') as month, sum(amount_clp) as ingresos
   from revenues group by 1, 2) r
  on e.truck_id = r.truck_id and e.month = r.month;

create index idx_checkins_date on daily_checkins(date);
create index idx_expenses_date on expenses(expense_date);
create index idx_tracks_assignment on route_tracks(route_assignment_id, recorded_at);
create index idx_visits_open on stop_visits(arrived_at) where departed_at is null;
