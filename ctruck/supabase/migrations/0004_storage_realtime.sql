-- Storage: el personal autenticado sube y lee fotos de los buckets CTruck
create policy ctruck_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('checkin-photos','cargo-photos','route-sheets','expense-receipts'));
create policy ctruck_storage_select on storage.objects for select to authenticated
  using (bucket_id in ('checkin-photos','cargo-photos','route-sheets','expense-receipts'));

-- Realtime: publicar cambios de las tablas operativas
alter publication supabase_realtime add table
  trucks, daily_checkins, route_assignments, cargo_receptions,
  delivery_records, stop_visits, km_warnings, maintenance_alerts;
