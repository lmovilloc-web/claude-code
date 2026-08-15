-- CTruck · Row Level Security
-- drivers/helpers ven solo sus datos, supervisors su flota, admins todo.

create or replace function current_app_user()
returns users language sql stable security definer set search_path = public as $$
  select * from users where auth_id = auth.uid() limit 1
$$;

create or replace function my_role() returns text language sql stable as $$
  select (current_app_user()).role
$$;

create or replace function my_user_id() returns uuid language sql stable as $$
  select (current_app_user()).id
$$;

create or replace function my_truck_id() returns uuid language sql stable as $$
  select (current_app_user()).truck_id
$$;

alter table trucks enable row level security;
alter table users enable row level security;
alter table daily_checkins enable row level security;
alter table routes enable row level security;
alter table route_assignments enable row level security;
alter table cargo_receptions enable row level security;
alter table delivery_stops enable row level security;
alter table delivery_records enable row level security;
alter table maintenance_alerts enable row level security;
alter table km_warnings enable row level security;
alter table expenses enable row level security;
alter table revenues enable row level security;
alter table report_subscriptions enable row level security;
alter table route_tracks enable row level security;
alter table stop_visits enable row level security;
alter table stop_dwell_alerts enable row level security;

-- Lectura general para personal autenticado en catálogos
create policy trucks_read on trucks for select to authenticated using (true);
create policy routes_read on routes for select to authenticated using (true);
create policy users_read on users for select to authenticated using (true);

-- Admin/supervisor gestionan catálogos
create policy trucks_admin on trucks for all to authenticated
  using (my_role() in ('admin','supervisor')) with check (my_role() in ('admin','supervisor'));
-- El chofer actualiza el km de su propio camión en el check-out
create policy trucks_driver_update on trucks for update to authenticated
  using (id = my_truck_id()) with check (id = my_truck_id());
create policy routes_admin on routes for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');
create policy users_admin on users for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- Check-ins: cada quien el suyo; panel ve todo
create policy checkins_own on daily_checkins for select to authenticated
  using (user_id = my_user_id() or my_role() in ('admin','supervisor'));
create policy checkins_insert on daily_checkins for insert to authenticated
  with check (user_id = my_user_id());
create policy checkins_update_own on daily_checkins for update to authenticated
  using (user_id = my_user_id());

-- Asignaciones y paradas: chofer/pioneta las de su camión
create policy assignments_read on route_assignments for select to authenticated
  using (truck_id = my_truck_id() or driver_id = my_user_id() or my_role() in ('admin','supervisor'));
create policy assignments_admin on route_assignments for all to authenticated
  using (my_role() in ('admin','supervisor')) with check (my_role() in ('admin','supervisor'));
-- El chofer/pioneta actualiza el estado de la asignación de su camión
create policy assignments_crew_update on route_assignments for update to authenticated
  using (truck_id = my_truck_id()) with check (truck_id = my_truck_id());
create policy stops_read on delivery_stops for select to authenticated
  using (exists (select 1 from route_assignments a where a.id = route_assignment_id
    and (a.truck_id = my_truck_id() or my_role() in ('admin','supervisor'))));
create policy stops_admin on delivery_stops for all to authenticated
  using (my_role() in ('admin','supervisor')) with check (my_role() in ('admin','supervisor'));

-- Recepciones, entregas, visitas y tracks: inserta el personal del camión, lee el panel
create policy receptions_rw on cargo_receptions for all to authenticated
  using (reported_by = my_user_id() or my_role() in ('admin','supervisor'))
  with check (reported_by = my_user_id());
create policy records_rw on delivery_records for all to authenticated
  using (reported_by = my_user_id() or my_role() in ('admin','supervisor'))
  with check (reported_by = my_user_id());
create policy visits_rw on stop_visits for all to authenticated
  using (reported_by = my_user_id() or my_role() in ('admin','supervisor'))
  with check (reported_by = my_user_id());
create policy tracks_insert on route_tracks for insert to authenticated
  with check (exists (select 1 from route_assignments a where a.id = route_assignment_id and a.truck_id = my_truck_id()));
create policy tracks_read on route_tracks for select to authenticated
  using (my_role() in ('admin','supervisor'));

-- Alertas: panel gestiona; involucrados leen
create policy maint_select on maintenance_alerts for select to authenticated using (true);
create policy maint_insert on maintenance_alerts for insert to authenticated with check (true);
create policy maint_update on maintenance_alerts for update to authenticated
  using (my_role() in ('admin','supervisor'));
create policy kmw_rw on km_warnings for all to authenticated
  using (driver_id = my_user_id() or my_role() in ('admin','supervisor'))
  with check (driver_id = my_user_id() or my_role() in ('admin','supervisor'));
create policy dwell_read on stop_dwell_alerts for select to authenticated
  using (my_role() in ('admin','supervisor'));

-- Gastos: admin todo; supervisor lee; chofer inserta combustible/peaje de su camión y ve lo propio
create policy expenses_admin on expenses for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');
create policy expenses_supervisor_read on expenses for select to authenticated
  using (my_role() = 'supervisor');
create policy expenses_driver_insert on expenses for insert to authenticated
  with check (my_role() = 'driver' and truck_id = my_truck_id()
    and category in ('combustible','peaje_tag') and reported_by = my_user_id());
create policy expenses_driver_read on expenses for select to authenticated
  using (reported_by = my_user_id());

-- Ingresos y suscripciones: solo admin
create policy revenues_admin on revenues for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');
create policy subs_own on report_subscriptions for all to authenticated
  using (user_id = my_user_id() or my_role() = 'admin')
  with check (user_id = my_user_id() or my_role() = 'admin');
