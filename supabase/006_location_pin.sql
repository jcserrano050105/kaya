-- KAYA — update 006: map pin for the service location.
-- Run once in SQL Editor after 005.
--
-- Bookings keep the customer's pinned point as location.lat / location.lng next to the
-- typed address. The pin is kept only when it falls inside the Philippines.

create or replace function public.wm_location(loc jsonb) returns jsonb language plpgsql immutable as $$
declare
  v jsonb := jsonb_build_object('address', loc->>'address', 'city', loc->>'city');
  v_lat numeric;
  v_lng numeric;
begin
  begin
    v_lat := (loc->>'lat')::numeric;
    v_lng := (loc->>'lng')::numeric;
  exception when others then
    return v;
  end;
  if v_lat between 4.5 and 21.5 and v_lng between 116 and 127 then
    v := v || jsonb_build_object('lat', round(v_lat, 6), 'lng', round(v_lng, 6));
  end if;
  return v;
end $$;

create or replace function public.wm_create_booking(who jsonb, p_idem text, body jsonb) returns jsonb language plpgsql as $$
declare
  b public.bookings;
  w public.workers;
  v_details jsonb := '[]';
  f text;
  v_at timestamptz := now();
  v_sched timestamptz;
begin
  if coalesce(p_idem, '') <> '' then
    select * into b from public.bookings where idem_key = p_idem;
    if found then return public.wm_ok(200, public.wm_booking_json(b)); end if;
  end if;
  foreach f in array array['customer_id', 'worker_id', 'service_id', 'schedule', 'location'] loop
    if coalesce(body->>f, '') = '' then
      v_details := v_details || jsonb_build_object('field', f, 'issue', 'required');
    end if;
  end loop;
  if coalesce(body->>'schedule', '') <> '' then
    if not public.wm_is_iso(body->>'schedule') then
      v_details := v_details || jsonb_build_object('field', 'schedule', 'issue', 'must be ISO 8601 with +08:00 offset');
    elsif (body->>'schedule')::timestamptz <= now() then
      v_details := v_details || jsonb_build_object('field', 'schedule', 'issue', 'must be in the future');
    end if;
  end if;
  if jsonb_typeof(body->'location') = 'object'
     and (coalesce(body->'location'->>'address', '') = '' or coalesce(body->'location'->>'city', '') = '') then
    v_details := v_details || jsonb_build_object('field', 'location', 'issue', 'address and city are required');
  end if;
  if jsonb_array_length(v_details) > 0 then return public.wm_invalid(v_details); end if;
  if body->>'customer_id' <> who->>'id' then
    return public.wm_fail(403, 'FORBIDDEN', 'You can only book for your own account.');
  end if;

  -- Lock the worker so two customers cannot take the same time slot at once.
  select * into w from public.workers where worker_id = body->>'worker_id' for update;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Worker not found.'); end if;
  if w.application_status <> 'APPROVED' or w.account_status <> 'ACTIVE' then
    return public.wm_fail(422, 'WORKER_NOT_APPROVED', 'This worker is not approved for bookings.');
  end if;
  if not ((body->>'service_id') = any (w.service_categories)) then
    return public.wm_fail(422, 'SKILL_MISMATCH', 'This worker does not offer the selected service.');
  end if;
  v_sched := (body->>'schedule')::timestamptz;
  if w.availability = 'offline' or public.wm_overlaps(w.worker_id, v_sched, null) then
    return public.wm_fail(409, 'WORKER_UNAVAILABLE', 'This worker is not available at the selected time.');
  end if;

  insert into public.bookings (booking_id, customer_id, customer_user, customer_name, worker_id, worker_name, service_id,
    schedule, location, problem_description, status, status_history, idem_key, created_at, updated_at)
  values ('BK-' || lpad(public.wm_next('booking')::text, 6, '0'), who->>'id', (who->>'uid')::uuid,
    coalesce(nullif(body->>'customer_name', ''), who->>'name'), w.worker_id, w.full_name, body->>'service_id', v_sched,
    public.wm_location(body->'location'),
    left(coalesce(body->>'problem_description', ''), 2000), 'PENDING',
    jsonb_build_array(jsonb_build_object('status', 'PENDING', 'at', public.wm_ts(v_at))),
    nullif(p_idem, ''), v_at, v_at)
  returning * into b;
  return public.wm_ok(201, public.wm_booking_json(b));
end $$;

revoke execute on function public.wm_location(jsonb) from public, anon, authenticated;
revoke execute on function public.wm_create_booking(jsonb, text, jsonb) from public, anon, authenticated;
