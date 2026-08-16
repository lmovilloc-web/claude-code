-- Multi-empresa: companies + alcance por empresa en RLS.
-- super_admin: global. admin: su empresa. Resto: su empresa vía catálogos.

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rut text,
  created_at timestamptz default now()
);

alter table users add column company_id uuid references companies(id);
alter table trucks add column company_id uuid references companies(id);
alter table routes add column company_id uuid references companies(id);

create or replace function is_super() returns boolean language sql stable as $$
  select (current_app_user()).role = 'super_admin'
$$;
create or replace function my_company_id() returns uuid language sql stable as $$
  select (current_app_user()).company_id
$$;

alter table companies enable row level security;
create policy companies_select on companies for select to authenticated
  using (is_super() or id = my_company_id());
create policy companies_super on companies for all to authenticated
  using (is_super()) with check (is_super());

-- Catálogos con alcance por empresa
drop policy trucks_read on trucks;
create policy trucks_read on trucks for select to authenticated
  using (is_super() or company_id = my_company_id());
drop policy users_read on users;
create policy users_read on users for select to authenticated
  using (is_super() or company_id = my_company_id() or auth_id = auth.uid());
drop policy routes_read on routes;
create policy routes_read on routes for select to authenticated
  using (is_super() or company_id = my_company_id());

-- Gestión: super_admin global; admin solo su empresa.
-- Solo el super_admin crea/edita administradores (y super_admins).
drop policy users_admin on users;
create policy users_manage on users for all to authenticated
  using (is_super() or (my_role() = 'admin' and company_id = my_company_id()))
  with check (is_super() or (my_role() = 'admin' and company_id = my_company_id()
    and role in ('supervisor','driver','helper')));

drop policy trucks_admin on trucks;
create policy trucks_admin on trucks for all to authenticated
  using (is_super() or (my_role() in ('admin','supervisor') and company_id = my_company_id()))
  with check (is_super() or (my_role() in ('admin','supervisor') and company_id = my_company_id()));

drop policy routes_admin on routes;
create policy routes_admin on routes for all to authenticated
  using (is_super() or (my_role() = 'admin' and company_id = my_company_id()))
  with check (is_super() or (my_role() = 'admin' and company_id = my_company_id()));

-- Gastos con alcance por empresa (vía camión; gasto sin camión = general de la empresa del autor)
drop policy expenses_admin on expenses;
create policy expenses_admin on expenses for all to authenticated
  using (is_super() or (my_role() = 'admin' and (truck_id is null or exists
    (select 1 from trucks t where t.id = truck_id and t.company_id = my_company_id()))))
  with check (is_super() or (my_role() = 'admin' and (truck_id is null or exists
    (select 1 from trucks t where t.id = truck_id and t.company_id = my_company_id()))));
