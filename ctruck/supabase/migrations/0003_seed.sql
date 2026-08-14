-- CTruck · Seed: 4 camiones FUSO, equipo y rutas principales a V Región

insert into trucks (code, plate, current_km, next_maintenance_km) values
  ('CTR-001', 'LXRS-21', 84200, 90000),
  ('CTR-002', 'LXTP-84', 76450, 78000),
  ('CTR-003', 'LYBB-33', 91800, 92600),
  ('CTR-004', 'LYCD-07', 68900, 75000);

insert into users (name, rut, role, truck_id) values
  ('Luis Movillo', '12.345.678-5', 'admin', null),
  ('Pedro Soto',   '14.567.890-3', 'driver', (select id from trucks where code = 'CTR-001')),
  ('Juan Fuentes', '15.678.901-1', 'driver', (select id from trucks where code = 'CTR-002')),
  ('Marcos Rivas', '16.789.012-K', 'driver', (select id from trucks where code = 'CTR-003')),
  ('Diego Ulloa',  '17.890.123-8', 'driver', (select id from trucks where code = 'CTR-004')),
  ('Camilo Peña',  '19.012.345-6', 'helper', (select id from trucks where code = 'CTR-001')),
  ('Andrés Vidal', '19.123.456-4', 'helper', (select id from trucks where code = 'CTR-002'));

insert into routes (name, origin, destination, planned_km, has_toll, toll_cost) values
  ('Santiago → Valparaíso',           'CD Santiago', 'Valparaíso',   240, true, 12400),
  ('Santiago → Viña del Mar',         'CD Santiago', 'Viña del Mar', 250, true, 12400),
  ('Santiago → Quillota / La Calera', 'CD Santiago', 'La Calera',    220, true,  9800),
  ('Santiago → San Antonio',          'CD Santiago', 'San Antonio',  230, true, 10600);

-- Buckets de Storage (ejecutar con service role o desde el dashboard):
--   checkin-photos · cargo-photos · route-sheets · expense-receipts
insert into storage.buckets (id, name, public) values
  ('checkin-photos', 'checkin-photos', false),
  ('cargo-photos', 'cargo-photos', false),
  ('route-sheets', 'route-sheets', false),
  ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;
