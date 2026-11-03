-- KAYA — update 004: verify the email before the sign-up form is submitted.
-- Run once in SQL Editor after 003.
--
-- Sign-up now happens in two steps:
--   1. The person enters their email and clicks Verify. Supabase emails a 6-digit code
--      (signInWithOtp with "pending": true in the metadata). Entering the code proves
--      they own the email and creates an unfinished account with no password.
--   2. They fill in the rest of the form and submit. The site sets the password and
--      calls complete_signup(), which saves the details (and the worker application)
--      and marks the account finished.
-- Unfinished accounts have status INCOMPLETE: they cannot log in (no password), and
-- wm_api() and the role checks only accept ACTIVE accounts.

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'INCOMPLETE'));

-- Creates the worker record for an application and returns its id (W001, W002, ...).
create or replace function public.wm_new_worker(p_user uuid, p_name text, p_city text, app jsonb) returns text
language plpgsql as $$
declare
  v_id text := 'W' || lpad(public.wm_next('worker')::text, 3, '0');
  v_service text;
  v_skills text[];
begin
  app := case when jsonb_typeof(app) = 'object' then app else '{}'::jsonb end;
  v_service := case when public.wm_services() ? coalesce(app->>'service_id', '') then app->>'service_id' else 'cleaning' end;
  select array(
    select x from jsonb_array_elements_text(case when jsonb_typeof(app->'skills') = 'array' then app->'skills' else '[]'::jsonb end) x
    where x in (select jsonb_array_elements_text(public.wm_services()->v_service))) into v_skills;
  insert into public.workers (worker_id, user_id, full_name, city, service_categories, verified_skills,
    requested_skills, certificates, years_experience, bio, id_type)
  values (v_id, p_user, coalesce(nullif(p_name, ''), 'New worker'), coalesce(nullif(p_city, ''), 'Quezon City'),
    array[v_service], array[v_service], v_skills,
    case when coalesce(app->>'certificate', '') <> '' then array[left(app->>'certificate', 200)] else '{}' end,
    least(greatest(coalesce(public.wm_num(app->>'years_experience'), 0), 0), 60)::int,
    left(coalesce(app->>'bio', ''), 1000), left(app->>'id_type', 40));
  return v_id;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}');
  r text := case when meta->>'role' = 'worker' then 'worker' else 'customer' end;
  v_pending boolean := coalesce(meta->>'pending', '') = 'true';
  v_link text := new.id::text;
begin
  -- Step 1 of the verify-first sign-up: only the email is known so far.
  if v_pending then
    insert into public.profiles (id, role, email, linked_id, status)
    values (new.id, 'customer', new.email, new.id::text, 'INCOMPLETE');
    return new;
  end if;

  -- Accounts created any other way (Supabase dashboard, older sign-up form).
  insert into public.profiles (id, role, email, full_name, phone, city, linked_id)
  values (new.id, r, new.email, coalesce(meta->>'full_name', ''), meta->>'phone', meta->>'city', v_link);
  if r = 'worker' then
    v_link := public.wm_new_worker(new.id, meta->>'full_name', meta->>'city', meta->'application');
    update public.profiles set linked_id = v_link where id = new.id;
  end if;
  return new;
end $$;

-- Step 2: save the sign-up details for the verified (signed-in) user.
create or replace function public.complete_signup(p_role text, p_full_name text, p_phone text, p_city text,
  p_application jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_link text;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Please verify your email again.'; end if;
  if p.status <> 'INCOMPLETE' then raise exception 'ALREADY_COMPLETE'; end if;
  if p_role not in ('customer', 'worker') then raise exception 'Unknown account type.'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'Enter your full name.'; end if;

  v_link := p.id::text;
  if p_role = 'worker' then
    v_link := public.wm_new_worker(p.id, trim(p_full_name), p_city, p_application);
  end if;
  update public.profiles
    set role = p_role, full_name = trim(p_full_name), phone = nullif(trim(coalesce(p_phone, '')), ''),
        city = nullif(trim(coalesce(p_city, '')), ''), linked_id = v_link, status = 'ACTIVE'
    where id = p.id returning * into p;
  return to_jsonb(p);
end $$;

revoke execute on function public.wm_new_worker(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.complete_signup(text, text, text, text, jsonb) from public, anon;
grant execute on function public.complete_signup(text, text, text, text, jsonb) to authenticated;
