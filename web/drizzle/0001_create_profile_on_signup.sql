-- Crea automáticamente la fila de public.profiles al primer login de una
-- cuenta nueva (issue #11) -- así el flujo único (#25, feature/frontend) no
-- tiene que decidir "insertar o no" desde la app, siempre existe.
--
-- SECURITY DEFINER: corre con privilegios del dueño de la función (postgres),
-- no del usuario que dispara el trigger -- necesario porque en el momento
-- del INSERT en auth.users todavía no hay una sesión autenticada con la que
-- la política RLS "id = auth.uid()" de profiles pudiera evaluarse a true.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, data)
  values (new.id, '{}'::jsonb)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
