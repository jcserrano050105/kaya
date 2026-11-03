# KAYA Integration Contract v1 — Gap Resolutions

This document fills the gaps found in the proposal draft. The website in this folder implements every rule below, so the presentation can point to working behavior.

---

## Gap 1 — One shared booking-status vocabulary

All statuses are UPPER_SNAKE_CASE strings. Both systems use exactly these values.

| Status | Meaning |
|---|---|
| `PENDING` | Booking created, waiting for the worker's answer |
| `ACCEPTED` | Worker accepted |
| `REJECTED` | Worker declined (final) |
| `ON_THE_WAY` | Worker is travelling to the customer |
| `ARRIVED` | Worker is at the customer's location |
| `IN_PROGRESS` | Work has started |
| `COMPLETED` | Work finished (final) |
| `CANCELLED` | Customer cancelled before the worker left (final) |

### Allowed transitions (validated on the server by Worker Management)

| From | To | Who can do it |
|---|---|---|
| PENDING | ACCEPTED, REJECTED | Worker |
| PENDING | CANCELLED | Customer |
| ACCEPTED | ON_THE_WAY | Worker |
| ACCEPTED | CANCELLED | Customer |
| ON_THE_WAY | ARRIVED | Worker |
| ARRIVED | IN_PROGRESS | Worker |
| IN_PROGRESS | COMPLETED | Worker |

Any other change returns `409 INVALID_TRANSITION`.

## Gap 2 — How live status tracking works

**Decision for v1: polling.** While a booking page is open, the Customer and Booking System calls `GET /api/v1/bookings/{booking_id}` every 5 seconds and updates the screen when `status` or `updated_at` changes. Polling stops once the booking is in a final status (COMPLETED, REJECTED, CANCELLED).

*Future option:* Worker Management sends a webhook (`POST /api/v1/webhooks/booking-status` on the Customer and Booking side) after each status change, with polling kept as a fallback.

## Gap 3 — Which system owns which data

| Data | Owner (single source of truth) | Copy kept by the other system |
|---|---|---|
| Worker accounts, applications, verification, skills | Worker Management | None, read through the API |
| Booking record and status | **Worker Management** | Customer and Booking keeps only `booking_id` references for the customer's history |
| Customer account, trusted contact | Customer and Booking | Never sent to Worker Management |
| Reviews and ratings | Worker Management (feeds the Work Passport) | Sent once, through the review endpoint |
| Incident reports | Worker Management (Admin reviews them) | None |

## Gap 4 — Reviews flow into the Work Passport

Added integration point:

| Source | Target | Data | Purpose |
|---|---|---|---|
| Customer and Booking | Worker Management | rating (1–5), comment | Update rating and Work Passport |
| Customer and Booking | Worker Management | worker report (reason, description) | Trust Profile "Report a concern" |

`POST /api/v1/bookings/{booking_id}/review` is allowed only when the booking is `COMPLETED`, and only once per booking (a second attempt returns `409 ALREADY_REVIEWED`).

## Gap 5 — Complete Trust Profile response

`GET /api/v1/workers/{worker_id}/profile`

```json
{
  "worker_id": "W014",
  "full_name": "Juan Dela Cruz",
  "approved": true,
  "identity_verified": true,
  "service_categories": ["plumbing"],
  "verified_skills": ["plumbing", "faucet_repair"],
  "certificates": ["TESDA Plumbing NC II"],
  "years_experience": 9,
  "city": "Quezon City",
  "completed_jobs": 86,
  "rating": 4.8,
  "review_count": 64,
  "recent_reviews": [
    { "rating": 5, "comment": "Fixed the leak quickly.", "created_at": "2026-10-12T15:20:00+08:00" }
  ],
  "availability": "available",
  "member_since": "2025-02-03T09:00:00+08:00"
}
```

Phone numbers, home addresses, ID documents and reviewer names are **never** included (Section 9 privacy rule).

## Gap 6 — Worker search endpoint

`GET /api/v1/workers?service=plumbing&city=Quezon%20City&schedule=2026-11-10T09:00:00%2B08:00`

Returns only workers that are `APPROVED`, have a verified skill in the service, are not `offline`, and (when `schedule` is given) have no active booking that overlaps that time slot.

```json
{ "data": [ { "worker_id": "W014", "full_name": "Juan Dela Cruz", "city": "Quezon City",
              "verified_skills": ["plumbing","faucet_repair"], "rating": 4.8,
              "completed_jobs": 86, "identity_verified": true, "availability": "available" } ],
  "count": 1 }
```

## Gap 7 — Emergency Assistance covers ARRIVED and IN_PROGRESS

The worker is already inside the home at `ARRIVED`, so the Get Help panel is shown for **ARRIVED and IN_PROGRESS**. `POST /api/v1/bookings/{booking_id}/incidents` is accepted only in those two statuses (otherwise `409 BOOKING_NOT_ACTIVE`).

`incident_type` values: `SAFETY_THREAT`, `HARASSMENT`, `PROPERTY_DAMAGE`, `THEFT`, `MEDICAL`, `OTHER`.

Request:

```json
{ "incident_type": "SAFETY_THREAT", "description": "Worker became aggressive.", "location_shared": true }
```

## Gap 8 — Authentication between the two systems

Every call from the Customer and Booking System carries:

| Header | Purpose |
|---|---|
| `X-KAYA-Client-Key` | Proves the request comes from the Customer and Booking System. A missing or wrong key returns `401 INVALID_CLIENT`. |
| `X-Customer-Id` | The logged-in customer the request is made for. Worker Management uses it to enforce "customers see only their own bookings" (`403 FORBIDDEN`). |

Worker and Admin portals are inside Worker Management and authenticate with a role (`worker` / `admin`) and user id. Admin-only endpoints return `403` for any other role.

## Gap 9 — Failure handling, double booking, duplicate requests

| Rule | Behavior |
|---|---|
| Timeout | The integration client waits at most **5 seconds**. On timeout or a network error, the customer sees "We could not confirm your booking" and **no booking is shown as confirmed**. |
| Duplicate requests | `POST /api/v1/bookings` requires an `Idempotency-Key` header (a UUID per booking attempt). Sending the same key again returns the original booking instead of creating a second one. |
| Double booking | Worker Management rejects a booking that overlaps an active booking of the same worker (default job length 2 hours) with `409 WORKER_UNAVAILABLE`. |
| Unapproved worker | `422 WORKER_NOT_APPROVED`. |
| Skill mismatch | `422 SKILL_MISMATCH`. |

## Gap 10 — Error structure, time format

**Every error uses this shape:**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request has invalid fields.",
    "details": [ { "field": "worker_id", "issue": "required" } ]
  },
  "request_id": "req_8f2c1a"
}
```

| HTTP | Codes |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 401 | `INVALID_CLIENT` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `INVALID_TRANSITION`, `WORKER_UNAVAILABLE`, `ALREADY_REVIEWED`, `BOOKING_NOT_ACTIVE` |
| 422 | `WORKER_NOT_APPROVED`, `SKILL_MISMATCH` |
| 503 | `SERVICE_UNAVAILABLE` |

**Date/time:** ISO 8601 with the Philippine offset, e.g. `2026-11-10T09:00:00+08:00` (timezone Asia/Manila). Schedules must be in the future.

**IDs:** workers `W###`, customers `C###`, bookings `BK-######`, incidents `INC-######`.

## Gap 11 — Document housekeeping (for the group)

- Replace the cover placeholders: group name, members and roles, instructor name.
- Update the date on the cover. It currently says September 30, 2026.
- Replace "ON THE WAY" / "IN PROGRESS" in Sections 4.3 and 5.3 with `ON_THE_WAY` / `IN_PROGRESS`, and add REJECTED and CANCELLED.
- Add the review and worker-report rows (Gap 4) to the Section 6 table.
- Change Section 4.4 and the Safety test in Section 8 from "IN PROGRESS" to "ARRIVED or IN_PROGRESS".

---

## Endpoint summary (v1)

| Method | Path | Caller |
|---|---|---|
| GET | `/api/v1/workers` | Customer and Booking |
| GET | `/api/v1/workers/{id}/profile` | Customer and Booking |
| POST | `/api/v1/workers/{id}/reports` | Customer and Booking |
| POST | `/api/v1/bookings` | Customer and Booking |
| GET | `/api/v1/bookings?customer_id=` | Customer and Booking |
| GET | `/api/v1/bookings/{id}` | Customer and Booking |
| PATCH | `/api/v1/bookings/{id}/status` | Worker portal, or Customer (cancel only) |
| POST | `/api/v1/bookings/{id}/review` | Customer and Booking |
| POST | `/api/v1/bookings/{id}/incidents` | Customer and Booking |
| POST | `/api/v1/workers/applications` | Worker portal |
| GET | `/api/v1/workers/{id}/bookings` | Worker portal |
| GET | `/api/v1/admin/applications` | Admin portal |
| PATCH | `/api/v1/admin/applications/{id}` | Admin portal |
| GET | `/api/v1/admin/incidents` | Admin portal |

---

## Gap 11 — Estimates, payments, warranty and admin endpoints (v1.1)

| Method & path | Caller | Rule |
|---|---|---|
| `PATCH /bookings/{id}/estimate` | Assigned worker | Allowed in ACCEPTED, ON_THE_WAY, ARRIVED. Body `{ labor, materials, note }`; the service fee (PHP 50) is added. Locked once approved (`409 ESTIMATE_LOCKED`). |
| `POST /bookings/{id}/estimate/decision` | Booking's customer | `{ decision: "APPROVED" \| "REVISION_REQUESTED", note }` — a revision needs a note. |
| `PATCH /bookings/{id}/status` → `IN_PROGRESS` | Assigned worker | Rejected with `409 ESTIMATE_NOT_APPROVED` until the customer approves the estimate. |
| `POST /bookings/{id}/payment` | Booking's customer | After COMPLETED. `{ method: CASH \| GCASH \| QR, reference }` — reference required for GCash/QR. Status `PENDING_CONFIRMATION`, transaction id `PAY-######`. |
| `POST /bookings/{id}/payment/confirm` | Assigned worker | Marks the payment `PAID`. |
| `POST /bookings/{id}/warranty` | Booking's customer | Within 30 days of completion, one open request per booking. |
| `GET /warranty` | All roles | Customer: own requests. Worker: own jobs. Admin: all (`?status=`). |
| `PATCH /warranty/{id}` | Role-dependent | Worker: OPEN/SCHEDULED → SCHEDULED (visit_date), SCHEDULED → RESOLVED. Customer: → DISPUTED (note), RESOLVED → CLOSED. Admin: DISPUTED → SCHEDULED (rework) or CLOSED, note required. |
| `GET /admin/bookings`, `GET /admin/reports` | Admin | Monitoring and report figures. |
| `PATCH /admin/workers/{id}/skills` | Admin | Sets verified skills; service categories follow the skills. |
| `PATCH /admin/workers/{id}/account` | Admin | `ACTIVE \| SUSPENDED \| DEACTIVATED`. Non-active workers are hidden from search and cannot be booked. |
| `PATCH /admin/incidents/{id}`, `PATCH /admin/worker-reports/{id}` | Admin | Case status `OPEN \| INVESTIGATING \| RESOLVED`. |

User accounts, sessions and role checks are described in [access-control.md](access-control.md).
