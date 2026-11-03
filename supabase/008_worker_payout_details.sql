-- KAYA — update 008: worker GCash details and QR code for customer payments.
-- Run once in SQL Editor after 007.
--
-- Workers save their GCash name, GCash number and a QR code image in their Profile.
-- A customer sees them only for their own booking, once payment is due (IN_PROGRESS or
-- COMPLETED and not yet paid). Nobody else can read them.
--
-- New routes (handled here, everything else goes to the original router, renamed wm_api_v1):
--   GET   workers/{id}/payout    the worker's own details (worker or admin)
--   PATCH workers/{id}/payout    save details (the worker only)
--   GET   bookings/{id}/payee    the assigned worker's details for paying (the customer only)

alter table public.workers add column if not exists payout jsonb not null default '{}';

-- Keep the original router under a new name (only the first time this file runs).
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'wm_api_v1') then
    alter function public.wm_api(text, text[], jsonb, jsonb, text) rename to wm_api_v1;
  end if;
end $$;

revoke execute on function public.wm_api_v1(text, text[], jsonb, jsonb, text) from public, anon, authenticated;

create or replace function public.wm_payout_json(w public.workers) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'gcash_name', coalesce(w.payout->>'gcash_name', ''),
    'gcash_number', coalesce(w.payout->>'gcash_number', ''),
    'qr_image', coalesce(w.payout->>'qr_image', ''),
    'updated_at', w.payout->>'updated_at')
$$;

create or replace function public.wm_set_payout(p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  w public.workers;
  v_name text := trim(coalesce(body->>'gcash_name', ''));
  v_number text := regexp_replace(coalesce(body->>'gcash_number', ''), '[\s-]', '', 'g');
  v_qr text := coalesce(body->>'qr_image', '');
  v_details jsonb := '[]';
begin
  if v_number like '+639%' then v_number := '0' || substr(v_number, 4); end if;
  if v_number <> '' and v_number !~ '^09\d{9}$' then
    v_details := v_details || jsonb_build_object('field', 'gcash_number', 'issue', 'use your GCash mobile number, e.g. 0917 123 4567');
  end if;
  if v_number <> '' and length(v_name) < 2 then
    v_details := v_details || jsonb_build_object('field', 'gcash_name', 'issue', 'enter the name on your GCash account');
  end if;
  if length(v_name) > 80 then
    v_details := v_details || jsonb_build_object('field', 'gcash_name', 'issue', 'use 80 characters or fewer');
  end if;
  if v_qr <> '' and (v_qr !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' or length(v_qr) > 700000) then
    v_details := v_details || jsonb_build_object('field', 'qr_image', 'issue', 'upload a PNG or JPG image of your QR code (up to about 500 KB)');
  end if;
  if jsonb_array_length(v_details) > 0 then return public.wm_invalid(v_details); end if;
  update public.workers
    set payout = jsonb_build_object('gcash_name', v_name, 'gcash_number', v_number, 'qr_image', v_qr,
                                    'updated_at', public.wm_ts(now()))
    where worker_id = p_id returning * into w;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Worker not found.'); end if;
  return public.wm_ok(200, public.wm_payout_json(w));
end $$;

create or replace function public.wm_get_payee(who jsonb, p_id text) returns jsonb language plpgsql as $$
declare
  b public.bookings;
  w public.workers;
begin
  select * into b from public.bookings where booking_id = p_id;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Booking not found.'); end if;
  if b.customer_id <> who->>'id' then return public.wm_fail(403, 'FORBIDDEN', 'Not your booking.'); end if;
  if b.status not in ('IN_PROGRESS', 'COMPLETED') or b.payment->>'status' = 'PAID' then
    return public.wm_fail(409, 'NOT_PAYABLE', 'Payment details are shown once payment is due.');
  end if;
  select * into w from public.workers where worker_id = b.worker_id;
  return public.wm_ok(200, public.wm_payout_json(w) || jsonb_build_object(
    'worker_id', w.worker_id, 'worker_name', w.full_name,
    'amount', coalesce((b.estimate->>'total')::numeric, 0)));
end $$;

create or replace function public.wm_api(p_method text, p_segments text[], p_query jsonb default '{}',
  p_body jsonb default null, p_idem text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  who jsonb;
  s text[] := p_segments;
  n int := coalesce(array_length(p_segments, 1), 0);
  m text := upper(p_method);
  w public.workers;
begin
  if (s[1] = 'workers' and n = 3 and s[3] = 'payout') or (s[1] = 'bookings' and n = 3 and s[3] = 'payee') then
    select jsonb_build_object('role', role, 'id', coalesce(linked_id, id::text), 'uid', id, 'name', full_name)
      into who from public.profiles where id = auth.uid() and status = 'ACTIVE';
    if who is null then return public.wm_fail(401, 'INVALID_CLIENT', 'Please log in again.'); end if;

    if s[1] = 'workers' and m = 'GET' then
      if not ((who->>'role' = 'worker' and who->>'id' = s[2]) or who->>'role' = 'admin') then
        return public.wm_fail(403, 'FORBIDDEN', 'Not your account.');
      end if;
      select * into w from public.workers where worker_id = s[2];
      if not found then return public.wm_fail(404, 'NOT_FOUND', 'Worker not found.'); end if;
      return public.wm_ok(200, public.wm_payout_json(w));
    end if;
    if s[1] = 'workers' and m = 'PATCH' then
      if not (who->>'role' = 'worker' and who->>'id' = s[2]) then
        return public.wm_fail(403, 'FORBIDDEN', 'Not your account.');
      end if;
      return public.wm_set_payout(s[2], coalesce(p_body, '{}'));
    end if;
    if s[1] = 'bookings' and m = 'GET' then
      if who->>'role' <> 'customer' then return public.wm_fail(403, 'FORBIDDEN', 'Only the customer can see payment details.'); end if;
      return public.wm_get_payee(who, s[2]);
    end if;
  end if;
  return public.wm_api_v1(p_method, p_segments, p_query, p_body, p_idem);
end $$;

revoke execute on function public.wm_payout_json(public.workers) from public, anon, authenticated;
revoke execute on function public.wm_set_payout(text, jsonb) from public, anon, authenticated;
revoke execute on function public.wm_get_payee(jsonb, text) from public, anon, authenticated;
revoke execute on function public.wm_api(text, text[], jsonb, jsonb, text) from public, anon;
grant execute on function public.wm_api(text, text[], jsonb, jsonb, text) to authenticated;
