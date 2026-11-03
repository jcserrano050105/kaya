-- KAYA — update 007: the customer pays before the job is marked completed.
-- Run once in SQL Editor after 006.
--
-- New order: IN_PROGRESS -> customer records payment -> worker confirms it ->
-- worker marks COMPLETED. Payment can be recorded while the job is IN_PROGRESS
-- (and still on older COMPLETED bookings that were never paid). COMPLETED is refused
-- with PAYMENT_REQUIRED until the payment is confirmed (status PAID).

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
  if v_to = 'COMPLETED' and coalesce(b.payment->>'status', '') <> 'PAID' then
    return public.wm_fail(409, 'PAYMENT_REQUIRED', 'Confirm the customer''s payment before marking the job completed.');
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
  if b.status not in ('IN_PROGRESS', 'COMPLETED') then
    return public.wm_fail(409, 'INVALID_TRANSITION', 'Payment is recorded once the worker has started the job.');
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

revoke execute on function public.wm_change_status(jsonb, text, jsonb) from public, anon, authenticated;
revoke execute on function public.wm_record_payment(jsonb, text, jsonb) from public, anon, authenticated;
