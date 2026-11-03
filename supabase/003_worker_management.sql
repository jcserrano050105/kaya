-- KAYA — update 003: Worker Management in Supabase.
-- Workers and their applications, bookings, estimates, payments, reviews, warranty
-- requests, incidents and worker reports. Run once in SQL Editor after 002.
--
-- The tables have row-level security with no policies, so the browser cannot read or
-- write them directly. Everything goes through wm_api(), which runs the same routes
-- and rules as js/worker-management/wm-api.js and identifies the caller from their
-- Supabase login (never from request headers).
--
-- This replaces the unused placeholder workers/bookings/warranty/incidents tables
-- created by schema.sql. They were never used by the site, so no data is lost.

drop table if exists public.warranty_requests cascade;
drop table if exists public.incidents cascade;
drop table if exists public.bookings cascade;
drop table if exists public.workers cascade;
drop function if exists public.booking_rules() cascade;

-- ───────── Tables ─────────

create table public.wm_counters (
  name  text primary key,
  value int not null default 0
);

create table public.workers (
  worker_id          text primary key,
  user_id            uuid unique references public.profiles(id) on delete set null,
  full_name          text not null,
  city               text not null,
  service_categories text[] not null default '{}',
  verified_skills    text[] not null default '{}',
  requested_skills   text[] not null default '{}',
  certificates       text[] not null default '{}',
  years_experience   int not null default 0,
  bio                text not null default '',
  id_type            text,
  identity_verified  boolean not null default false,
  application_status text not null default 'PENDING' check (application_status in ('PENDING','APPROVED','REJECTED')),
  availability       text not null default 'available' check (availability in ('available','busy','offline')),
  completed_jobs     int not null default 0,
  rating_total       numeric not null default 0,
  rating_count       int not null default 0,
  applied_at         timestamptz not null default now(),
  review_note        text not null default '',
  account_status     text not null default 'ACTIVE' check (account_status in ('ACTIVE','SUSPENDED','DEACTIVATED'))
);

create table public.bookings (
  booking_id          text primary key,
  customer_id         text not null,
  customer_user       uuid references public.profiles(id) on delete set null,
  customer_name       text not null default '',
  worker_id           text not null references public.workers(worker_id),
  worker_name         text not null default '',
  service_id          text not null,
  schedule            timestamptz not null,
  location            jsonb not null,
  problem_description text not null default '',
  status              text not null default 'PENDING',
  status_history      jsonb not null default '[]',
  estimate            jsonb,
  payment             jsonb,
  reviewed            boolean not null default false,
  review              jsonb,
  idem_key            text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index bookings_customer_idx on public.bookings (customer_id);
create index bookings_worker_idx on public.bookings (worker_id, schedule);

create table public.reviews (
  booking_id text primary key references public.bookings(booking_id) on delete cascade,
  worker_id  text not null references public.workers(worker_id),
  rating     int not null check (rating between 1 and 5),
  comment    text not null default '',
  created_at timestamptz not null default now()
);

create table public.incidents (
  incident_id              text primary key,
  booking_id               text not null references public.bookings(booking_id) on delete cascade,
  worker_id                text not null,
  customer_id              text not null,
  booking_status_at_report text not null,
  incident_type            text not null,
  description              text not null,
  location_shared          boolean not null,
  status                   text not null default 'OPEN',
  admin_note               text not null default '',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table public.worker_reports (
  report_id   text primary key,
  worker_id   text not null references public.workers(worker_id),
  customer_id text not null,
  reason      text not null,
  description text not null,
  status      text not null default 'OPEN',
  admin_note  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.warranty_requests (
  warranty_id     text primary key,
  booking_id      text not null references public.bookings(booking_id) on delete cascade,
  customer_id     text not null,
  worker_id       text not null,
  service_id      text not null,
  description     text not null,
  photo_count     int not null default 0,
  preferred_date  text not null,
  status          text not null default 'OPEN',
  visit_date      text not null default '',
  resolution_note text not null default '',
  dispute_reason  text not null default '',
  admin_note      text not null default '',
  history         jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.wm_counters       enable row level security;
alter table public.workers           enable row level security;
alter table public.bookings          enable row level security;
alter table public.reviews           enable row level security;
alter table public.incidents         enable row level security;
alter table public.worker_reports    enable row level security;
alter table public.warranty_requests enable row level security;

-- ───────── Helpers ─────────

create or replace function public.wm_next(p_name text) returns int language sql as $$
  insert into public.wm_counters (name, value) values (p_name, 1)
  on conflict (name) do update set value = public.wm_counters.value + 1
  returning value
$$;

-- Timestamps in the API's format: Manila time with a +08:00 offset.
create or replace function public.wm_ts(t timestamptz) returns text language sql stable as $$
  select case when t is null then null
    else to_char(t at time zone 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS') || '+08:00' end
$$;

create or replace function public.wm_ok(p_status int, p_body jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('status', p_status, 'body', p_body)
$$;

create or replace function public.wm_fail(p_status int, p_code text, p_message text, p_details jsonb default '[]')
returns jsonb language sql volatile as $$
  select jsonb_build_object('status', p_status, 'body', jsonb_build_object(
    'error', jsonb_build_object('code', p_code, 'message', p_message, 'details', p_details),
    'request_id', 'req_' || substr(md5(random()::text), 1, 6)))
$$;

create or replace function public.wm_invalid(p_details jsonb) returns jsonb language sql volatile as $$
  select public.wm_fail(400, 'VALIDATION_ERROR', 'Request has invalid fields.', p_details)
$$;

create or replace function public.wm_issue(p_field text, p_issue text) returns jsonb language sql immutable as $$
  select jsonb_build_array(jsonb_build_object('field', p_field, 'issue', p_issue))
$$;

create or replace function public.wm_num(t text) returns numeric language plpgsql immutable as $$
begin
  return round(t::numeric, 2);
exception when others then
  return null;
end $$;

create or replace function public.wm_is_iso(t text) returns boolean language sql immutable as $$
  select coalesce(t ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$', false)
$$;

-- Same as KAYA.SERVICES in js/shared/contract.js.
create or replace function public.wm_services() returns jsonb language sql immutable as $$
  select '{
    "laundry":    ["laundry", "ironing", "dry_cleaning"],
    "cleaning":   ["cleaning", "deep_cleaning", "aircon_cleaning"],
    "plumbing":   ["plumbing", "faucet_repair", "drain_unclogging"],
    "electrical": ["electrical", "wiring", "outlet_repair"],
    "carpentry":  ["carpentry", "furniture_repair", "door_repair"],
    "gardening":  ["gardening", "lawn_mowing", "tree_trimming"]
  }'::jsonb
$$;

create or replace function public.wm_rating(w public.workers) returns numeric language sql immutable as $$
  select case when w.rating_count > 0 then round(w.rating_total / w.rating_count, 1) else 0 end
$$;

create or replace function public.wm_worker_summary(w public.workers) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'worker_id', w.worker_id, 'full_name', w.full_name, 'city', w.city,
    'service_categories', to_jsonb(w.service_categories), 'verified_skills', to_jsonb(w.verified_skills),
    'identity_verified', w.identity_verified, 'years_experience', w.years_experience,
    'completed_jobs', w.completed_jobs, 'rating', public.wm_rating(w), 'review_count', w.rating_count,
    'availability', w.availability)
$$;

create or replace function public.wm_worker_full(w public.workers) returns jsonb language sql stable as $$
  select public.wm_worker_summary(w) || jsonb_build_object(
    'certificates', to_jsonb(w.certificates), 'bio', w.bio, 'id_type', w.id_type,
    'application_status', w.application_status, 'applied_at', public.wm_ts(w.applied_at),
    'review_note', w.review_note, 'account_status', w.account_status,
    'requested_skills', to_jsonb(w.requested_skills),
    'rating_total', w.rating_total, 'rating_count', w.rating_count)
$$;

create or replace function public.wm_booking_json(b public.bookings) returns jsonb language sql stable as $$
  select (to_jsonb(b) - 'idem_key' - 'customer_user') || jsonb_build_object(
    'schedule', public.wm_ts(b.schedule), 'created_at', public.wm_ts(b.created_at), 'updated_at', public.wm_ts(b.updated_at))
$$;

create or replace function public.wm_warranty_json(x public.warranty_requests) returns jsonb language sql stable as $$
  select to_jsonb(x) || jsonb_build_object('created_at', public.wm_ts(x.created_at), 'updated_at', public.wm_ts(x.updated_at))
$$;

create or replace function public.wm_incident_json(x public.incidents) returns jsonb language sql stable as $$
  select to_jsonb(x) || jsonb_build_object('created_at', public.wm_ts(x.created_at), 'updated_at', public.wm_ts(x.updated_at))
$$;

create or replace function public.wm_report_json(x public.worker_reports) returns jsonb language sql stable as $$
  select to_jsonb(x) || jsonb_build_object('created_at', public.wm_ts(x.created_at), 'updated_at', public.wm_ts(x.updated_at))
$$;

-- A job blocks two hours (KAYA.JOB_LENGTH_HOURS).
create or replace function public.wm_overlaps(p_worker text, p_start timestamptz, p_ignore text) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.bookings b
    where b.worker_id = p_worker and b.booking_id is distinct from p_ignore
      and b.status in ('PENDING','ACCEPTED','ON_THE_WAY','ARRIVED','IN_PROGRESS')
      and p_start < b.schedule + interval '2 hours' and b.schedule < p_start + interval '2 hours')
$$;

-- null when the caller may act on the booking, otherwise the error response.
create or replace function public.wm_access(who jsonb, b public.bookings) returns jsonb language plpgsql as $$
begin
  if who->>'role' = 'customer' and b.customer_id <> who->>'id' then
    return public.wm_fail(403, 'FORBIDDEN', 'Not your booking.');
  end if;
  if who->>'role' = 'worker' and b.worker_id <> who->>'id' then
    return public.wm_fail(403, 'FORBIDDEN', 'Not your assigned booking.');
  end if;
  return null;
end $$;

-- ───────── Workers ─────────

create or replace function public.wm_search_workers(q jsonb) returns jsonb language plpgsql as $$
declare
  v_sched text := coalesce(q->>'schedule', '');
  v_list jsonb;
begin
  if v_sched <> '' and not public.wm_is_iso(v_sched) then
    return public.wm_invalid(public.wm_issue('schedule', 'must be ISO 8601 with +08:00 offset'));
  end if;
  select coalesce(jsonb_agg(public.wm_worker_summary(w) order by public.wm_rating(w) desc), '[]'::jsonb) into v_list
  from public.workers w
  where w.application_status = 'APPROVED' and w.account_status = 'ACTIVE' and w.availability <> 'offline'
    and (coalesce(q->>'service', '') = '' or (q->>'service') = any (w.service_categories))
    and (coalesce(q->>'city', '') = '' or w.city = q->>'city')
    and (v_sched = '' or not public.wm_overlaps(w.worker_id, v_sched::timestamptz, null));
  return public.wm_ok(200, jsonb_build_object('data', v_list, 'count', jsonb_array_length(v_list)));
end $$;

create or replace function public.wm_worker_profile(who jsonb, p_id text) returns jsonb language plpgsql as $$
declare
  w public.workers;
  v jsonb;
begin
  select * into w from public.workers where worker_id = p_id;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Worker not found.'); end if;
  if who->>'role' = 'customer' and w.application_status <> 'APPROVED' then
    return public.wm_fail(404, 'NOT_FOUND', 'Worker not found.');
  end if;
  if who->>'role' = 'worker' and who->>'id' <> w.worker_id then
    return public.wm_fail(403, 'FORBIDDEN', 'Not your account.');
  end if;
  v := public.wm_worker_summary(w) || jsonb_build_object(
    'approved', w.application_status = 'APPROVED',
    'certificates', to_jsonb(w.certificates),
    'bio', w.bio,
    'member_since', public.wm_ts(w.applied_at),
    'recent_reviews', (
      select coalesce(jsonb_agg(jsonb_build_object('rating', r.rating, 'comment', r.comment, 'created_at', public.wm_ts(r.created_at))
        order by r.created_at desc), '[]'::jsonb)
      from (select * from public.reviews where worker_id = w.worker_id order by created_at desc limit 3) r));
  if who->>'role' <> 'customer' then
    v := v || jsonb_build_object('application_status', w.application_status, 'review_note', w.review_note,
      'account_status', w.account_status, 'requested_skills', to_jsonb(w.requested_skills));
  end if;
  return public.wm_ok(200, v);
end $$;

create or replace function public.wm_set_availability(p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  w public.workers;
begin
  if coalesce(body->>'availability', '') not in ('available', 'busy', 'offline') then
    return public.wm_invalid(public.wm_issue('availability', 'must be available, busy or offline'));
  end if;
  update public.workers set availability = body->>'availability' where worker_id = p_id returning * into w;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Worker not found.'); end if;
  return public.wm_ok(200, public.wm_worker_summary(w));
end $$;

create or replace function public.wm_report_worker(who jsonb, p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  x public.worker_reports;
begin
  if not exists (select 1 from public.workers where worker_id = p_id) then
    return public.wm_fail(404, 'NOT_FOUND', 'Worker not found.');
  end if;
  if coalesce(body->>'reason', '') = '' or coalesce(body->>'description', '') = '' then
    return public.wm_invalid(public.wm_issue('reason', 'reason and description are required'));
  end if;
  insert into public.worker_reports (report_id, worker_id, customer_id, reason, description)
  values ('RPT-' || lpad(public.wm_next('report')::text, 6, '0'), p_id, who->>'id', body->>'reason', left(body->>'description', 1000))
  returning * into x;
  return public.wm_ok(201, public.wm_report_json(x));
end $$;

-- ───────── Bookings ─────────

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
    jsonb_build_object('address', body->'location'->>'address', 'city', body->'location'->>'city'),
    left(coalesce(body->>'problem_description', ''), 2000), 'PENDING',
    jsonb_build_array(jsonb_build_object('status', 'PENDING', 'at', public.wm_ts(v_at))),
    nullif(p_idem, ''), v_at, v_at)
  returning * into b;
  return public.wm_ok(201, public.wm_booking_json(b));
end $$;

create or replace function public.wm_get_booking(who jsonb, p_id text) returns jsonb language plpgsql as $$
declare
  b public.bookings;
  v_err jsonb;
begin
  select * into b from public.bookings where booking_id = p_id;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Booking not found.'); end if;
  v_err := public.wm_access(who, b);
  if v_err is not null then return v_err; end if;
  return public.wm_ok(200, public.wm_booking_json(b));
end $$;

-- Same as KAYA.TRANSITIONS: from -> { to: role allowed to make the change }.
create or replace function public.wm_change_status(who jsonb, p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  b public.bookings;
  v_err jsonb;
  v_to text := body->>'status';
  v_role text;
  v_at timestamptz := now();
  trans jsonb := '{
    "PENDING":     {"ACCEPTED": "worker", "REJECTED": "worker", "CANCELLED": "customer"},
    "ACCEPTED":    {"ON_THE_WAY": "worker", "CANCELLED": "customer"},
    "ON_THE_WAY":  {"ARRIVED": "worker"},
    "ARRIVED":     {"IN_PROGRESS": "worker"},
    "IN_PROGRESS": {"COMPLETED": "worker"}
  }';
begin
  select * into b from public.bookings where booking_id = p_id for update;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Booking not found.'); end if;
  v_err := public.wm_access(who, b);
  if v_err is not null then return v_err; end if;
  v_role := trans->b.status->>v_to;
  if v_role is null then
    return public.wm_fail(409, 'INVALID_TRANSITION', 'Cannot change status from ' || b.status || ' to ' || coalesce(v_to, '') || '.');
  end if;
  if v_role <> who->>'role' then
    return public.wm_fail(403, 'FORBIDDEN', 'Your role cannot set status ' || v_to || '.');
  end if;
  if v_to = 'IN_PROGRESS' and coalesce(b.estimate->>'status', '') <> 'APPROVED' then
    return public.wm_fail(409, 'ESTIMATE_NOT_APPROVED', 'Work can only start after the customer approves the estimate.');
  end if;
  update public.bookings
    set status = v_to,
        status_history = status_history || jsonb_build_object('status', v_to, 'at', public.wm_ts(v_at)),
        updated_at = v_at
    where booking_id = p_id returning * into b;
  if v_to = 'COMPLETED' then
    update public.workers set completed_jobs = completed_jobs + 1 where worker_id = b.worker_id;
  end if;
  return public.wm_ok(200, public.wm_booking_json(b));
end $$;

create or replace function public.wm_submit_review(who jsonb, p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  b public.bookings;
  v_r int;
  v_comment text := left(coalesce(body->>'comment', ''), 500);
  v_at timestamptz := now();
begin
  select * into b from public.bookings where booking_id = p_id for update;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Booking not found.'); end if;
  if b.customer_id <> who->>'id' then return public.wm_fail(403, 'FORBIDDEN', 'Not your booking.'); end if;
  if b.status <> 'COMPLETED' then
    return public.wm_fail(409, 'INVALID_TRANSITION', 'Only completed bookings can be reviewed.');
  end if;
  if b.reviewed then return public.wm_fail(409, 'ALREADY_REVIEWED', 'This booking already has a review.'); end if;
  if coalesce(body->>'rating', '') !~ '^[1-5](\.0+)?$' then
    return public.wm_invalid(public.wm_issue('rating', 'must be an integer 1-5'));
  end if;
  v_r := (body->>'rating')::numeric::int;
  insert into public.reviews (booking_id, worker_id, rating, comment, created_at) values (p_id, b.worker_id, v_r, v_comment, v_at);
  update public.bookings
    set reviewed = true,
        review = jsonb_build_object('rating', v_r, 'comment', v_comment, 'created_at', public.wm_ts(v_at))
    where booking_id = p_id;
  update public.workers set rating_total = rating_total + v_r, rating_count = rating_count + 1 where worker_id = b.worker_id;
  return public.wm_ok(201, jsonb_build_object('booking_id', p_id, 'worker_id', b.worker_id, 'rating', v_r,
    'comment', v_comment, 'created_at', public.wm_ts(v_at)));
end $$;

create or replace function public.wm_report_incident(who jsonb, p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  b public.bookings;
  x public.incidents;
  v_details jsonb := '[]';
begin
  select * into b from public.bookings where booking_id = p_id;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Booking not found.'); end if;
  if b.customer_id <> who->>'id' then return public.wm_fail(403, 'FORBIDDEN', 'Not your booking.'); end if;
  if b.status not in ('ARRIVED', 'IN_PROGRESS') then
    return public.wm_fail(409, 'BOOKING_NOT_ACTIVE', 'Incidents can only be reported while the worker is at your location.');
  end if;
  if coalesce(body->>'incident_type', '') not in ('SAFETY_THREAT', 'HARASSMENT', 'PROPERTY_DAMAGE', 'THEFT', 'MEDICAL', 'OTHER') then
    v_details := v_details || jsonb_build_object('field', 'incident_type', 'issue', 'unknown value');
  end if;
  if coalesce(body->>'description', '') = '' then
    v_details := v_details || jsonb_build_object('field', 'description', 'issue', 'required');
  end if;
  if coalesce(jsonb_typeof(body->'location_shared'), '') <> 'boolean' then
    v_details := v_details || jsonb_build_object('field', 'location_shared', 'issue', 'must be true or false');
  end if;
  if jsonb_array_length(v_details) > 0 then return public.wm_invalid(v_details); end if;
  insert into public.incidents (incident_id, booking_id, worker_id, customer_id, booking_status_at_report,
    incident_type, description, location_shared)
  values ('INC-' || lpad(public.wm_next('incident')::text, 6, '0'), p_id, b.worker_id, b.customer_id, b.status,
    body->>'incident_type', left(body->>'description', 1000), (body->>'location_shared')::boolean)
  returning * into x;
  return public.wm_ok(201, public.wm_incident_json(x));
end $$;

-- ───────── Estimates ─────────

create or replace function public.wm_submit_estimate(who jsonb, p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  b public.bookings;
  v_labor numeric := public.wm_num(body->>'labor');
  v_mat numeric := public.wm_num(body->>'materials');
  v_details jsonb := '[]';
  v_at timestamptz := now();
begin
  select * into b from public.bookings where booking_id = p_id for update;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Booking not found.'); end if;
  if b.worker_id <> who->>'id' then return public.wm_fail(403, 'FORBIDDEN', 'Not your assigned booking.'); end if;
  if b.status not in ('ACCEPTED', 'ON_THE_WAY', 'ARRIVED') then
    return public.wm_fail(409, 'INVALID_TRANSITION', 'Estimates can be sent after accepting and before work starts.');
  end if;
  if b.estimate->>'status' = 'APPROVED' then
    return public.wm_fail(409, 'ESTIMATE_LOCKED', 'The customer already approved this estimate.');
  end if;
  if v_labor is null or not (v_labor > 0 and v_labor <= 100000) then
    v_details := v_details || jsonb_build_object('field', 'labor', 'issue', 'must be between 1 and 100,000');
  end if;
  if v_mat is null or not (v_mat >= 0 and v_mat <= 100000) then
    v_details := v_details || jsonb_build_object('field', 'materials', 'issue', 'must be between 0 and 100,000');
  end if;
  if jsonb_array_length(v_details) > 0 then return public.wm_invalid(v_details); end if;
  update public.bookings
    set estimate = jsonb_build_object('labor', v_labor, 'materials', v_mat, 'service_fee', 50, 'total', v_labor + v_mat + 50,
          'note', left(coalesce(body->>'note', ''), 500), 'status', 'SUBMITTED', 'submitted_at', public.wm_ts(v_at),
          'decided_at', null, 'revision_note', coalesce(b.estimate->>'revision_note', '')),
        updated_at = v_at
    where booking_id = p_id returning * into b;
  return public.wm_ok(200, public.wm_booking_json(b));
end $$;

create or replace function public.wm_decide_estimate(who jsonb, p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  b public.bookings;
  v_dec text := body->>'decision';
  v_at timestamptz := now();
begin
  select * into b from public.bookings where booking_id = p_id for update;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Booking not found.'); end if;
  if b.customer_id <> who->>'id' then return public.wm_fail(403, 'FORBIDDEN', 'Not your booking.'); end if;
  if coalesce(b.estimate->>'status', '') <> 'SUBMITTED' then
    return public.wm_fail(409, 'NO_PENDING_ESTIMATE', 'There is no estimate waiting for your decision.');
  end if;
  if coalesce(v_dec, '') not in ('APPROVED', 'REVISION_REQUESTED') then
    return public.wm_invalid(public.wm_issue('decision', 'must be APPROVED or REVISION_REQUESTED'));
  end if;
  if v_dec = 'REVISION_REQUESTED' and trim(coalesce(body->>'note', '')) = '' then
    return public.wm_invalid(public.wm_issue('note', 'tell the worker what to change'));
  end if;
  update public.bookings
    set estimate = estimate || jsonb_build_object('status', v_dec, 'decided_at', public.wm_ts(v_at),
          'revision_note', case when v_dec = 'REVISION_REQUESTED' then left(body->>'note', 500)
                                else coalesce(estimate->>'revision_note', '') end),
        updated_at = v_at
    where booking_id = p_id returning * into b;
  return public.wm_ok(200, public.wm_booking_json(b));
end $$;

-- ───────── Payments ─────────

create or replace function public.wm_record_payment(who jsonb, p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  b public.bookings;
  v_method text := body->>'method';
  v_ref text := upper(trim(coalesce(body->>'reference', '')));
  v_details jsonb := '[]';
  v_at timestamptz := now();
begin
  select * into b from public.bookings where booking_id = p_id for update;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Booking not found.'); end if;
  if b.customer_id <> who->>'id' then return public.wm_fail(403, 'FORBIDDEN', 'Not your booking.'); end if;
  if b.status <> 'COMPLETED' then
    return public.wm_fail(409, 'INVALID_TRANSITION', 'Payment is recorded after the service is completed.');
  end if;
  if b.payment->>'status' = 'PAID' then return public.wm_fail(409, 'ALREADY_PAID', 'This booking is already paid.'); end if;
  if coalesce(v_method, '') not in ('CASH', 'GCASH', 'QR') then
    v_details := v_details || jsonb_build_object('field', 'method', 'issue', 'must be CASH, GCASH or QR');
  end if;
  if v_method is distinct from 'CASH' and v_ref !~ '^[A-Z0-9-]{6,24}$' then
    v_details := v_details || jsonb_build_object('field', 'reference', 'issue', 'enter the 6-24 character transaction reference');
  end if;
  if jsonb_array_length(v_details) > 0 then return public.wm_invalid(v_details); end if;
  update public.bookings
    set payment = jsonb_build_object('transaction_id', 'PAY-' || lpad(public.wm_next('payment')::text, 6, '0'),
          'method', v_method, 'reference', case when v_method = 'CASH' then '' else v_ref end,
          'amount', coalesce((estimate->>'total')::numeric, 0), 'status', 'PENDING_CONFIRMATION',
          'recorded_at', public.wm_ts(v_at), 'confirmed_at', null),
        updated_at = v_at
    where booking_id = p_id returning * into b;
  return public.wm_ok(200, public.wm_booking_json(b));
end $$;

create or replace function public.wm_confirm_payment(who jsonb, p_id text) returns jsonb language plpgsql as $$
declare
  b public.bookings;
  v_at timestamptz := now();
begin
  select * into b from public.bookings where booking_id = p_id for update;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Booking not found.'); end if;
  if b.worker_id <> who->>'id' then return public.wm_fail(403, 'FORBIDDEN', 'Not your assigned booking.'); end if;
  if coalesce(b.payment->>'status', '') <> 'PENDING_CONFIRMATION' then
    return public.wm_fail(409, 'NO_PENDING_PAYMENT', 'There is no payment waiting for confirmation.');
  end if;
  update public.bookings
    set payment = payment || jsonb_build_object('status', 'PAID', 'confirmed_at', public.wm_ts(v_at)),
        updated_at = v_at
    where booking_id = p_id returning * into b;
  return public.wm_ok(200, public.wm_booking_json(b));
end $$;

-- ───────── Warranty and rework ─────────

create or replace function public.wm_create_warranty(who jsonb, p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  b public.bookings;
  x public.warranty_requests;
  v_done timestamptz;
  v_details jsonb := '[]';
  v_at timestamptz := now();
begin
  select * into b from public.bookings where booking_id = p_id;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Booking not found.'); end if;
  if b.customer_id <> who->>'id' then return public.wm_fail(403, 'FORBIDDEN', 'Not your booking.'); end if;
  if b.status <> 'COMPLETED' then
    return public.wm_fail(409, 'INVALID_TRANSITION', 'Warranty applies to completed bookings only.');
  end if;
  select (e->>'at')::timestamptz into v_done
    from jsonb_array_elements(b.status_history) e where e->>'status' = 'COMPLETED' limit 1;
  if v_done is null or now() - v_done > interval '30 days' then
    return public.wm_fail(409, 'WARRANTY_EXPIRED', 'The 30-day warranty period for this booking has ended.');
  end if;
  if exists (select 1 from public.warranty_requests where booking_id = p_id and status <> 'CLOSED') then
    return public.wm_fail(409, 'WARRANTY_OPEN', 'This booking already has an open warranty request.');
  end if;
  if trim(coalesce(body->>'description', '')) = '' then
    v_details := v_details || jsonb_build_object('field', 'description', 'issue', 'required');
  end if;
  if coalesce(body->>'preferred_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    v_details := v_details || jsonb_build_object('field', 'preferred_date', 'issue', 'required (YYYY-MM-DD)');
  end if;
  if jsonb_array_length(v_details) > 0 then return public.wm_invalid(v_details); end if;
  insert into public.warranty_requests (warranty_id, booking_id, customer_id, worker_id, service_id, description,
    photo_count, preferred_date, history, created_at, updated_at)
  values ('WR-' || lpad(public.wm_next('warranty')::text, 6, '0'), p_id, b.customer_id, b.worker_id, b.service_id,
    left(body->>'description', 1000), least(greatest(coalesce(public.wm_num(body->>'photo_count'), 0), 0), 10)::int,
    body->>'preferred_date',
    jsonb_build_array(jsonb_build_object('status', 'OPEN', 'at', public.wm_ts(v_at), 'by', 'customer')), v_at, v_at)
  returning * into x;
  return public.wm_ok(201, public.wm_warranty_json(x));
end $$;

-- Who may move a warranty request where:
--   worker:   OPEN/SCHEDULED -> SCHEDULED (visit_date), SCHEDULED -> RESOLVED
--   customer: OPEN/SCHEDULED/RESOLVED -> DISPUTED (reason), RESOLVED -> CLOSED
--   admin:    DISPUTED -> SCHEDULED (rework ordered) or CLOSED (decision note)
create or replace function public.wm_update_warranty(who jsonb, p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  x public.warranty_requests;
  v_role text := who->>'role';
  v_to text := body->>'status';
  v_note text := trim(coalesce(body->>'note', ''));
  v_at timestamptz := now();
  moves jsonb := '{
    "worker":   {"OPEN": ["SCHEDULED"], "SCHEDULED": ["SCHEDULED", "RESOLVED"]},
    "customer": {"OPEN": ["DISPUTED"], "SCHEDULED": ["DISPUTED"], "RESOLVED": ["DISPUTED", "CLOSED"]},
    "admin":    {"DISPUTED": ["SCHEDULED", "CLOSED"]}
  }';
begin
  select * into x from public.warranty_requests where warranty_id = p_id for update;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Warranty request not found.'); end if;
  if (v_role = 'customer' and x.customer_id <> who->>'id') or (v_role = 'worker' and x.worker_id <> who->>'id') then
    return public.wm_fail(403, 'FORBIDDEN', 'Not your warranty request.');
  end if;
  if v_to is null or not coalesce((moves->v_role->x.status) ? v_to, false) then
    return public.wm_fail(409, 'INVALID_TRANSITION', 'Cannot change warranty status from ' || x.status || ' to ' || coalesce(v_to, '') || '.');
  end if;
  if v_to = 'SCHEDULED' and coalesce(nullif(body->>'visit_date', ''), x.visit_date) !~ '^\d{4}-\d{2}-\d{2}' then
    return public.wm_invalid(public.wm_issue('visit_date', 'required'));
  end if;
  if v_to = 'DISPUTED' and v_note = '' then
    return public.wm_invalid(public.wm_issue('note', 'explain why you are escalating'));
  end if;
  if v_role = 'admin' and v_note = '' then
    return public.wm_invalid(public.wm_issue('note', 'a decision note is required'));
  end if;
  update public.warranty_requests
    set visit_date = coalesce(nullif(body->>'visit_date', ''), visit_date),
        resolution_note = case when v_to = 'RESOLVED' then left(coalesce(body->>'note', ''), 500) else resolution_note end,
        dispute_reason = case when v_to = 'DISPUTED' then left(body->>'note', 500) else dispute_reason end,
        admin_note = case when v_role = 'admin' then left(body->>'note', 500) else admin_note end,
        status = v_to,
        history = history || jsonb_build_object('status', v_to, 'at', public.wm_ts(v_at), 'by', v_role),
        updated_at = v_at
    where warranty_id = p_id returning * into x;
  return public.wm_ok(200, public.wm_warranty_json(x));
end $$;

-- ───────── Admin tools ─────────

create or replace function public.wm_review_application(p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  w public.workers;
  v_dec text := body->>'decision';
begin
  select * into w from public.workers where worker_id = p_id for update;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Application not found.'); end if;
  if coalesce(v_dec, '') not in ('APPROVED', 'REJECTED') then
    return public.wm_invalid(public.wm_issue('decision', 'must be APPROVED or REJECTED'));
  end if;
  if w.application_status <> 'PENDING' then
    return public.wm_fail(409, 'INVALID_TRANSITION', 'This application was already reviewed.');
  end if;
  update public.workers
    set application_status = v_dec,
        identity_verified = coalesce(body->'identity_verified' = 'true'::jsonb, false),
        review_note = coalesce(body->>'note', '')
    where worker_id = p_id returning * into w;
  return public.wm_ok(200, public.wm_worker_full(w));
end $$;

create or replace function public.wm_set_account_status(p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  w public.workers;
begin
  if coalesce(body->>'account_status', '') not in ('ACTIVE', 'SUSPENDED', 'DEACTIVATED') then
    return public.wm_invalid(public.wm_issue('account_status', 'must be ACTIVE, SUSPENDED or DEACTIVATED'));
  end if;
  update public.workers set account_status = body->>'account_status' where worker_id = p_id returning * into w;
  if not found then return public.wm_fail(404, 'NOT_FOUND', 'Worker not found.'); end if;
  return public.wm_ok(200, public.wm_worker_full(w));
end $$;

create or replace function public.wm_set_skills(p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  w public.workers;
  v_skills text[];
  v_bad text[];
  v_cats text[];
begin
  if not exists (select 1 from public.workers where worker_id = p_id) then
    return public.wm_fail(404, 'NOT_FOUND', 'Worker not found.');
  end if;
  select array(select jsonb_array_elements_text(case when jsonb_typeof(body->'verified_skills') = 'array'
    then body->'verified_skills' else '[]'::jsonb end)) into v_skills;
  select array(select x from unnest(v_skills) x where not exists (
    select 1 from jsonb_each(public.wm_services()) s, jsonb_array_elements_text(s.value) k where k = x)) into v_bad;
  if cardinality(v_skills) = 0 or cardinality(v_bad) > 0 then
    return public.wm_invalid(public.wm_issue('verified_skills',
      case when cardinality(v_bad) > 0 then 'unknown: ' || array_to_string(v_bad, ', ') else 'at least one skill' end));
  end if;
  select array(select s.key from jsonb_each(public.wm_services()) s
    where exists (select 1 from jsonb_array_elements_text(s.value) k where k = any (v_skills))) into v_cats;
  update public.workers set verified_skills = v_skills, service_categories = v_cats
    where worker_id = p_id returning * into w;
  return public.wm_ok(200, public.wm_worker_full(w));
end $$;

create or replace function public.wm_set_case_status(p_kind text, p_id text, body jsonb) returns jsonb language plpgsql as $$
declare
  v jsonb;
  i public.incidents;
  r public.worker_reports;
begin
  if coalesce(body->>'status', '') not in ('OPEN', 'INVESTIGATING', 'RESOLVED') then
    return public.wm_invalid(public.wm_issue('status', 'must be OPEN, INVESTIGATING or RESOLVED'));
  end if;
  if p_kind = 'incidents' then
    update public.incidents set status = body->>'status', admin_note = left(coalesce(body->>'note', ''), 500), updated_at = now()
      where incident_id = p_id returning * into i;
    if found then v := public.wm_incident_json(i); end if;
  else
    update public.worker_reports set status = body->>'status', admin_note = left(coalesce(body->>'note', ''), 500), updated_at = now()
      where report_id = p_id returning * into r;
    if found then v := public.wm_report_json(r); end if;
  end if;
  if v is null then return public.wm_fail(404, 'NOT_FOUND', 'Case not found.'); end if;
  return public.wm_ok(200, v);
end $$;

create or replace function public.wm_reports() returns jsonb language plpgsql as $$
declare
  v_status jsonb;
  v_completed int;
  v_finished int;
begin
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into v_status
    from (select status, count(*) n from public.bookings group by status) t;
  v_completed := coalesce((v_status->>'COMPLETED')::int, 0);
  v_finished := v_completed + coalesce((v_status->>'REJECTED')::int, 0) + coalesce((v_status->>'CANCELLED')::int, 0);
  return public.wm_ok(200, jsonb_build_object(
    'bookings_total', (select count(*) from public.bookings),
    'bookings_by_status', v_status,
    'bookings_by_service', (select jsonb_object_agg(s.key, (select count(*) from public.bookings b where b.service_id = s.key))
                            from jsonb_each(public.wm_services()) s),
    'completion_rate', case when v_finished > 0 then round(v_completed * 100.0 / v_finished) else 0 end,
    'revenue_paid', (select coalesce(sum((payment->>'amount')::numeric), 0) from public.bookings where payment->>'status' = 'PAID'),
    'service_fees', (select coalesce(sum(coalesce((estimate->>'service_fee')::numeric, 0)), 0) from public.bookings where payment->>'status' = 'PAID'),
    'workers_by_application', jsonb_build_object(
      'PENDING', (select count(*) from public.workers where application_status = 'PENDING'),
      'APPROVED', (select count(*) from public.workers where application_status = 'APPROVED'),
      'REJECTED', (select count(*) from public.workers where application_status = 'REJECTED')),
    'average_rating', (select coalesce(round(avg(public.wm_rating(w)), 1), 0) from public.workers w where w.rating_count > 0),
    'open_incidents', (select count(*) from public.incidents where status <> 'RESOLVED'),
    'open_disputes', (select count(*) from public.warranty_requests where status = 'DISPUTED'),
    'warranty_total', (select count(*) from public.warranty_requests)));
end $$;

-- ───────── Router ─────────
-- Mirrors handle() in wm-api.js. Path segments arrive already split and decoded,
-- e.g. GET workers?service=plumbing -> p_segments {workers}, p_query {"service":"plumbing"}.
-- Arrays here start at 1, so s[1] is the JavaScript s[0].

create or replace function public.wm_api(p_method text, p_segments text[], p_query jsonb default '{}',
  p_body jsonb default null, p_idem text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  who jsonb;
  s text[] := p_segments;
  n int := coalesce(array_length(p_segments, 1), 0);
  m text := upper(p_method);
  q jsonb := coalesce(p_query, '{}');
  body jsonb := coalesce(p_body, '{}');
  v_role text;
  v_list jsonb;
begin
  select jsonb_build_object('role', role, 'id', coalesce(linked_id, id::text), 'uid', id, 'name', full_name)
    into who from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if who is null then return public.wm_fail(401, 'INVALID_CLIENT', 'Please log in again.'); end if;
  v_role := who->>'role';

  if s[1] = 'workers' then
    if m = 'GET' and n = 1 then return public.wm_search_workers(q); end if;
    if m = 'POST' and s[2] = 'applications' then
      return public.wm_fail(403, 'FORBIDDEN', 'Applications are submitted together with worker registration.');
    end if;
    if m = 'GET' and s[3] = 'profile' then return public.wm_worker_profile(who, s[2]); end if;
    if m = 'POST' and s[3] = 'reports' then
      if v_role <> 'customer' then return public.wm_fail(403, 'FORBIDDEN', 'Only customers can report workers.'); end if;
      return public.wm_report_worker(who, s[2], body);
    end if;
    if m = 'GET' and s[3] = 'bookings' then
      if v_role <> 'admin' and not (v_role = 'worker' and who->>'id' = s[2]) then
        return public.wm_fail(403, 'FORBIDDEN', 'Not your bookings.');
      end if;
      select coalesce(jsonb_agg(public.wm_booking_json(b) order by b.schedule), '[]'::jsonb) into v_list
        from public.bookings b where b.worker_id = s[2];
      return public.wm_ok(200, jsonb_build_object('data', v_list, 'count', jsonb_array_length(v_list)));
    end if;
    if m = 'PATCH' and s[3] = 'availability' then
      if not (v_role = 'worker' and who->>'id' = s[2]) then return public.wm_fail(403, 'FORBIDDEN', 'Not your account.'); end if;
      return public.wm_set_availability(s[2], body);
    end if;
  end if;

  if s[1] = 'bookings' then
    if n = 1 and m = 'POST' then
      if v_role <> 'customer' then return public.wm_fail(403, 'FORBIDDEN', 'Only customers can create bookings.'); end if;
      return public.wm_create_booking(who, p_idem, body);
    end if;
    if n = 1 and m = 'GET' then
      if v_role <> 'customer' or coalesce(q->>'customer_id', '') <> who->>'id' then
        return public.wm_fail(403, 'FORBIDDEN', 'You can only list your own bookings.');
      end if;
      select coalesce(jsonb_agg(public.wm_booking_json(b) order by b.created_at desc), '[]'::jsonb) into v_list
        from public.bookings b where b.customer_id = who->>'id';
      return public.wm_ok(200, jsonb_build_object('data', v_list, 'count', jsonb_array_length(v_list)));
    end if;
    if n = 2 and m = 'GET' then return public.wm_get_booking(who, s[2]); end if;
    if s[3] = 'status' and m = 'PATCH' then return public.wm_change_status(who, s[2], body); end if;
    if s[3] = 'review' and m = 'POST' then
      if v_role <> 'customer' then return public.wm_fail(403, 'FORBIDDEN', 'Only customers can review.'); end if;
      return public.wm_submit_review(who, s[2], body);
    end if;
    if s[3] = 'incidents' and m = 'POST' then
      if v_role <> 'customer' then return public.wm_fail(403, 'FORBIDDEN', 'Only customers can report incidents.'); end if;
      return public.wm_report_incident(who, s[2], body);
    end if;
    if s[3] = 'estimate' and n = 3 and m = 'PATCH' then
      if v_role <> 'worker' then return public.wm_fail(403, 'FORBIDDEN', 'Only the assigned worker can send an estimate.'); end if;
      return public.wm_submit_estimate(who, s[2], body);
    end if;
    if s[3] = 'estimate' and s[4] = 'decision' and m = 'POST' then
      if v_role <> 'customer' then return public.wm_fail(403, 'FORBIDDEN', 'Only the customer can approve an estimate.'); end if;
      return public.wm_decide_estimate(who, s[2], body);
    end if;
    if s[3] = 'payment' and n = 3 and m = 'POST' then
      if v_role <> 'customer' then return public.wm_fail(403, 'FORBIDDEN', 'Only the customer can record a payment.'); end if;
      return public.wm_record_payment(who, s[2], body);
    end if;
    if s[3] = 'payment' and s[4] = 'confirm' and m = 'POST' then
      if v_role <> 'worker' then return public.wm_fail(403, 'FORBIDDEN', 'Only the assigned worker can confirm payment.'); end if;
      return public.wm_confirm_payment(who, s[2]);
    end if;
    if s[3] = 'warranty' and m = 'POST' then
      if v_role <> 'customer' then return public.wm_fail(403, 'FORBIDDEN', 'Only customers can request warranty service.'); end if;
      return public.wm_create_warranty(who, s[2], body);
    end if;
  end if;

  if s[1] = 'warranty' then
    if n = 1 and m = 'GET' then
      select coalesce(jsonb_agg(public.wm_warranty_json(x) order by x.updated_at desc), '[]'::jsonb) into v_list
        from public.warranty_requests x
        where case v_role
          when 'customer' then x.customer_id = who->>'id'
          when 'worker' then x.worker_id = who->>'id'
          else coalesce(q->>'status', '') = '' or x.status = q->>'status' end;
      return public.wm_ok(200, jsonb_build_object('data', v_list, 'count', jsonb_array_length(v_list)));
    end if;
    if n = 2 and m = 'PATCH' then return public.wm_update_warranty(who, s[2], body); end if;
  end if;

  if s[1] = 'admin' then
    if v_role <> 'admin' then return public.wm_fail(403, 'FORBIDDEN', 'Admin role required.'); end if;
    if s[2] = 'applications' and n = 2 and m = 'GET' then
      select coalesce(jsonb_agg(public.wm_worker_full(w) order by w.applied_at desc), '[]'::jsonb) into v_list
        from public.workers w where coalesce(q->>'status', '') = '' or w.application_status = q->>'status';
      return public.wm_ok(200, jsonb_build_object('data', v_list, 'count', jsonb_array_length(v_list)));
    end if;
    if s[2] = 'applications' and n = 3 and m = 'PATCH' then return public.wm_review_application(s[3], body); end if;
    if s[2] = 'incidents' and n = 2 and m = 'GET' then
      return public.wm_ok(200, jsonb_build_object(
        'incidents', (select coalesce(jsonb_agg(public.wm_incident_json(x) order by x.created_at desc), '[]'::jsonb) from public.incidents x),
        'worker_reports', (select coalesce(jsonb_agg(public.wm_report_json(x) order by x.created_at desc), '[]'::jsonb) from public.worker_reports x)));
    end if;
    if s[2] in ('incidents', 'worker-reports') and n = 3 and m = 'PATCH' then
      return public.wm_set_case_status(s[2], s[3], body);
    end if;
    if s[2] = 'bookings' and m = 'GET' then
      select coalesce(jsonb_agg(public.wm_booking_json(b) order by b.created_at desc), '[]'::jsonb) into v_list
        from public.bookings b where coalesce(q->>'status', '') = '' or b.status = q->>'status';
      return public.wm_ok(200, jsonb_build_object('data', v_list, 'count', jsonb_array_length(v_list)));
    end if;
    if s[2] = 'workers' and s[4] = 'account' and m = 'PATCH' then return public.wm_set_account_status(s[3], body); end if;
    if s[2] = 'workers' and s[4] = 'skills' and m = 'PATCH' then return public.wm_set_skills(s[3], body); end if;
    if s[2] = 'reports' and m = 'GET' then return public.wm_reports(); end if;
  end if;

  return public.wm_fail(404, 'NOT_FOUND', 'No route for ' || m || ' ' || array_to_string(s, '/'));
end $$;

-- ───────── Worker sign-up creates the application ─────────
-- The worker form sends its application in the sign-up metadata, so it is saved even
-- before the email is confirmed (there is no session yet at that point).

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}');
  r text := case when meta->>'role' = 'worker' then 'worker' else 'customer' end;
  app jsonb := case when jsonb_typeof(meta->'application') = 'object' then meta->'application' else '{}' end;
  v_link text := new.id::text;
  v_service text;
  v_skills text[];
begin
  if r = 'worker' then
    v_link := 'W' || lpad(public.wm_next('worker')::text, 3, '0');
  end if;

  insert into public.profiles (id, role, email, full_name, phone, city, linked_id)
  values (new.id, r, new.email, coalesce(meta->>'full_name', ''), meta->>'phone', meta->>'city', v_link);

  if r = 'worker' then
    v_service := case when public.wm_services() ? coalesce(app->>'service_id', '') then app->>'service_id' else 'cleaning' end;
    select array(
      select x from jsonb_array_elements_text(case when jsonb_typeof(app->'skills') = 'array' then app->'skills' else '[]'::jsonb end) x
      where x in (select jsonb_array_elements_text(public.wm_services()->v_service))) into v_skills;
    insert into public.workers (worker_id, user_id, full_name, city, service_categories, verified_skills,
      requested_skills, certificates, years_experience, bio, id_type)
    values (v_link, new.id, coalesce(nullif(meta->>'full_name', ''), 'New worker'),
      coalesce(nullif(meta->>'city', ''), 'Quezon City'), array[v_service], array[v_service], v_skills,
      case when coalesce(app->>'certificate', '') <> '' then array[left(app->>'certificate', 200)] else '{}' end,
      least(greatest(coalesce(public.wm_num(app->>'years_experience'), 0), 0), 60)::int,
      left(coalesce(app->>'bio', ''), 1000), left(app->>'id_type', 40));
  end if;
  return new;
end $$;

-- ───────── Permissions ─────────
-- Only signed-in users may call wm_api(); the helpers are internal.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname like 'wm\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

grant execute on function public.wm_api(text, text[], jsonb, jsonb, text) to authenticated;
