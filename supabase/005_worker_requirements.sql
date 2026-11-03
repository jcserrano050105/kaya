-- KAYA — update 005: worker application requirements (NBI clearance, barangay
-- clearance, police clearance, TESDA certificate, medical certificate).
-- Run once in SQL Editor after 004.
--
-- Stores what the applicant declared: document numbers, dates and the names of the
-- files they attached. The files themselves are not uploaded yet (that needs
-- Supabase Storage); the admin checks the originals during verification.

alter table public.workers add column if not exists documents jsonb not null default '{}';

-- Keeps only the known requirement fields, with length limits.
create or replace function public.wm_clean_documents(d jsonb) returns jsonb language sql immutable as $$
  select case when jsonb_typeof(d) <> 'object' then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object(
    'nbi', case when jsonb_typeof(d->'nbi') = 'object' then jsonb_build_object(
      'number', left(d->'nbi'->>'number', 40), 'valid_until', left(d->'nbi'->>'valid_until', 10), 'file_name', left(d->'nbi'->>'file_name', 120)) end,
    'barangay', case when jsonb_typeof(d->'barangay') = 'object' then jsonb_build_object(
      'issued_on', left(d->'barangay'->>'issued_on', 10), 'file_name', left(d->'barangay'->>'file_name', 120)) end,
    'police', case when jsonb_typeof(d->'police') = 'object' then jsonb_build_object(
      'file_name', left(d->'police'->>'file_name', 120)) end,
    'tesda', case when jsonb_typeof(d->'tesda') = 'object' then jsonb_build_object(
      'file_name', left(d->'tesda'->>'file_name', 120)) end,
    'medical', case when jsonb_typeof(d->'medical') = 'object' then jsonb_build_object(
      'file_name', left(d->'medical'->>'file_name', 120)) end,
    'id_file_name', left(d->>'id_file_name', 120))) end
$$;

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
    requested_skills, certificates, years_experience, bio, id_type, documents)
  values (v_id, p_user, coalesce(nullif(p_name, ''), 'New worker'), coalesce(nullif(p_city, ''), 'Quezon City'),
    array[v_service], array[v_service], v_skills,
    case when coalesce(app->>'certificate', '') <> '' then array[left(app->>'certificate', 200)] else '{}' end,
    least(greatest(coalesce(public.wm_num(app->>'years_experience'), 0), 0), 60)::int,
    left(coalesce(app->>'bio', ''), 1000), left(app->>'id_type', 40),
    public.wm_clean_documents(app->'documents'));
  return v_id;
end $$;

-- Admin application cards and the worker's own profile include the requirements.
create or replace function public.wm_worker_full(w public.workers) returns jsonb language sql stable as $$
  select public.wm_worker_summary(w) || jsonb_build_object(
    'certificates', to_jsonb(w.certificates), 'bio', w.bio, 'id_type', w.id_type,
    'application_status', w.application_status, 'applied_at', public.wm_ts(w.applied_at),
    'review_note', w.review_note, 'account_status', w.account_status,
    'requested_skills', to_jsonb(w.requested_skills), 'documents', w.documents,
    'rating_total', w.rating_total, 'rating_count', w.rating_count)
$$;

revoke execute on function public.wm_clean_documents(jsonb) from public, anon, authenticated;
revoke execute on function public.wm_new_worker(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.wm_worker_full(public.workers) from public, anon, authenticated;
