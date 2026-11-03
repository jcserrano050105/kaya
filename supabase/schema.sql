-- KAYA — Supabase schema with row-level security.
-- Run once in Supabase Dashboard → SQL Editor → New query → Run.

-- ───────── Profiles (one per auth user) ─────────
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  role        text not null default 'customer' check (role in ('customer','worker','admin')),
  full_name   text not null default '',
  phone       text,
  city        text,
  address     text,
  trusted_contact jsonb,
  status      text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','DEACTIVATED')),
  created_at  timestamptz not null default now()
);

-- Role helpers (security definer so policies can read profiles without recursion)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() and status = 'ACTIVE' $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() = 'admin', false) $$;

-- New sign-ups: role comes from sign-up metadata, but only customer/worker.
-- Admins are promoted manually in SQL (see docs/supabase-setup.md).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, phone, city)
  values (
    new.id,
    case when new.raw_user_meta_data->>'role' = 'worker' then 'worker' else 'customer' end,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'city'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Users may edit their own contact fields, never role or status.
create or replace function public.protect_profile() returns trigger
language plpgsql as $$
begin
  -- Applies to website requests only; the SQL Editor (role postgres) may change anything.
  if current_user in ('anon', 'authenticated') and not public.is_admin() and (new.role <> old.role or new.status <> old.status) then
    raise exception 'Not allowed to change role or status';
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile();

-- ───────── Services catalog ─────────
create table public.services (
  id          text primary key,
  name        text not null,
  tagline     text,
  description text,
  price       numeric(10,2) not null,
  includes    text[] default '{}',
  active      boolean not null default true
);

insert into public.services (id, name, price) values
  ('plumbing','Plumbing',350), ('electrical','Electrical',400), ('cleaning','Cleaning',500),
  ('laundry','Laundry',250), ('carpentry','Carpentry',450), ('gardening','Gardening',400);

-- ───────── Workers (application + public profile) ─────────
create table public.workers (
  id                 uuid primary key references public.profiles on delete cascade,
  service_id         text references public.services,
  skills             text[] default '{}',
  requested_skills   text[] default '{}',
  years_experience   int default 0,
  id_type            text,
  application_status text not null default 'PENDING' check (application_status in ('PENDING','APPROVED','REJECTED')),
  rating             numeric(2,1) default 0,
  jobs_completed     int default 0,
  created_at         timestamptz not null default now()
);

-- ───────── Bookings ─────────
create table public.bookings (
  id           uuid primary key default gen_random_uuid(),
  ref          text unique default ('BK-' || to_char(now(),'YYMMDDHH24MISS')),
  customer_id  uuid not null references public.profiles,
  worker_id    uuid references public.workers,
  service_id   text references public.services,
  problem      text,
  address      text,
  scheduled_at timestamptz,
  status       text not null default 'PENDING',
  estimate     jsonb,   -- {labor, materials, fee, status, note}
  payment      jsonb,   -- {method, reference, status}
  review       jsonb,   -- {rating, comment}
  created_at   timestamptz not null default now()
);

-- Worker cannot start work before the customer approves the estimate.
create or replace function public.booking_rules() returns trigger
language plpgsql as $$
begin
  if new.status = 'IN_PROGRESS' and old.status <> 'IN_PROGRESS'
     and coalesce(new.estimate->>'status','') <> 'APPROVED' then
    raise exception 'ESTIMATE_NOT_APPROVED';
  end if;
  return new;
end $$;

create trigger bookings_rules before update on public.bookings
  for each row execute function public.booking_rules();

-- ───────── Warranty requests & incidents ─────────
create table public.warranty_requests (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings on delete cascade,
  description text not null,
  preferred_date date,
  visit_date  date,
  status      text not null default 'OPEN' check (status in ('OPEN','SCHEDULED','RESOLVED','DISPUTED','CLOSED')),
  notes       jsonb default '[]',
  created_at  timestamptz not null default now()
);

create table public.incidents (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid references public.bookings,
  reporter_id uuid not null default auth.uid() references public.profiles,
  kind        text not null,
  details     text,
  status      text not null default 'OPEN',
  created_at  timestamptz not null default now()
);

-- ───────── Row-level security ─────────
alter table public.profiles          enable row level security;
alter table public.services          enable row level security;
alter table public.workers           enable row level security;
alter table public.bookings          enable row level security;
alter table public.warranty_requests enable row level security;
alter table public.incidents         enable row level security;

-- Profiles: own row, or admin
create policy "profiles read own"   on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles update own" on public.profiles for update using (id = auth.uid() or public.is_admin());

-- Services: public reads active ones; admin manages
create policy "services public read" on public.services for select using (active or public.is_admin());
create policy "services admin write" on public.services for all using (public.is_admin()) with check (public.is_admin());

-- Workers: approved profiles are public; own row; admin
create policy "workers read" on public.workers for select
  using (application_status = 'APPROVED' or id = auth.uid() or public.is_admin());
create policy "workers apply" on public.workers for insert
  with check (id = auth.uid() and public.my_role() = 'worker' and application_status = 'PENDING');
create policy "workers admin update" on public.workers for update using (public.is_admin());

-- Bookings: customer sees own, worker sees assigned, admin sees all
create policy "bookings read" on public.bookings for select
  using (customer_id = auth.uid() or worker_id = auth.uid() or public.is_admin());
create policy "bookings create" on public.bookings for insert
  with check (customer_id = auth.uid() and public.my_role() = 'customer');
create policy "bookings update" on public.bookings for update
  using (customer_id = auth.uid() or worker_id = auth.uid() or public.is_admin());

-- Warranty: parties of the booking, or admin
create policy "warranty read" on public.warranty_requests for select using (
  public.is_admin() or exists (select 1 from public.bookings b where b.id = booking_id
    and (b.customer_id = auth.uid() or b.worker_id = auth.uid())));
create policy "warranty create" on public.warranty_requests for insert with check (
  exists (select 1 from public.bookings b where b.id = booking_id
    and b.customer_id = auth.uid() and b.status = 'COMPLETED'));
create policy "warranty update" on public.warranty_requests for update using (
  public.is_admin() or exists (select 1 from public.bookings b where b.id = booking_id
    and (b.customer_id = auth.uid() or b.worker_id = auth.uid())));

-- Incidents: reporter or admin
create policy "incidents read"   on public.incidents for select using (reporter_id = auth.uid() or public.is_admin());
create policy "incidents create" on public.incidents for insert with check (reporter_id = auth.uid());
create policy "incidents admin"  on public.incidents for update using (public.is_admin());
