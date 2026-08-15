-- Rol super_admin: máximo privilegio. Para no reescribir todas las policies,
-- my_role() lo normaliza a 'admin' (RLS intacto); users.role guarda el rol real.
alter table users drop constraint users_role_check;
alter table users add constraint users_role_check
  check (role in ('super_admin','admin','supervisor','driver','helper'));

create or replace function my_role() returns text language sql stable as $$
  select case when (current_app_user()).role = 'super_admin' then 'admin'
              else (current_app_user()).role end
$$;

-- Nota: en producción se eliminaron los usuarios del seed inicial; queda
-- únicamente l.movilloc@gmail.com como super_admin. Los perfiles del equipo
-- se crearán desde el panel (Fase 1) o vía Authentication → Users.
