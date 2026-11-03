-- KAYA — update 002: store email and the linked customer/worker id on each profile.
-- Run once in SQL Editor after schema.sql.

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists linked_id text;

update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;
update public.profiles set linked_id = id::text where linked_id is null and role <> 'worker';

-- Customers are linked to their own user id; workers to the id of their application.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text := case when new.raw_user_meta_data->>'role' = 'worker' then 'worker' else 'customer' end;
begin
  insert into public.profiles (id, role, email, full_name, phone, city, linked_id)
  values (
    new.id, r, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'city',
    case when r = 'worker' then new.raw_user_meta_data->>'linked_id' else new.id::text end
  );
  return new;
end $$;

-- Users may edit their own contact fields, never role, status, email or linked id.
create or replace function public.protect_profile() returns trigger
language plpgsql as $$
begin
  -- Applies to website requests only; the SQL Editor (role postgres) may change anything.
  if current_user in ('anon', 'authenticated') and not public.is_admin() and (new.role <> old.role or new.status <> old.status
      or new.email is distinct from old.email or new.linked_id is distinct from old.linked_id) then
    raise exception 'Not allowed to change role, status, email or linked id';
  end if;
  return new;
end $$;
