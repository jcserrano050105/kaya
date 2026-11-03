/* Shared interface contract (v1) used by BOTH systems.
   See docs/integration-contract.md. */
var KAYA = window.KAYA || {};

KAYA.SERVICES = [
  { id: "laundry",    name: "Laundry",    skills: ["laundry", "ironing", "dry_cleaning"] },
  { id: "cleaning",   name: "Cleaning",   skills: ["cleaning", "deep_cleaning", "aircon_cleaning"] },
  { id: "plumbing",   name: "Plumbing",   skills: ["plumbing", "faucet_repair", "drain_unclogging"] },
  { id: "electrical", name: "Electrical", skills: ["electrical", "wiring", "outlet_repair"] },
  { id: "carpentry",  name: "Carpentry",  skills: ["carpentry", "furniture_repair", "door_repair"] },
  { id: "gardening",  name: "Gardening",  skills: ["gardening", "lawn_mowing", "tree_trimming"] }
];

KAYA.CITIES = ["Quezon City", "Manila", "Makati", "Pasig", "Taguig", "Caloocan"];

KAYA.STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  ON_THE_WAY: "ON_THE_WAY",
  ARRIVED: "ARRIVED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED"
};

KAYA.STATUS_LABELS = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  ON_THE_WAY: "On the way",
  ARRIVED: "Arrived",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled"
};

/* Happy-path order shown in the tracking stepper. */
KAYA.STATUS_FLOW = ["PENDING", "ACCEPTED", "ON_THE_WAY", "ARRIVED", "IN_PROGRESS", "COMPLETED"];

KAYA.FINAL_STATUSES = ["COMPLETED", "REJECTED", "CANCELLED"];
KAYA.ACTIVE_STATUSES = ["PENDING", "ACCEPTED", "ON_THE_WAY", "ARRIVED", "IN_PROGRESS"];
KAYA.EMERGENCY_STATUSES = ["ARRIVED", "IN_PROGRESS"];

/* from -> { to: allowed role } */
KAYA.TRANSITIONS = {
  PENDING:     { ACCEPTED: "worker", REJECTED: "worker", CANCELLED: "customer" },
  ACCEPTED:    { ON_THE_WAY: "worker", CANCELLED: "customer" },
  ON_THE_WAY:  { ARRIVED: "worker" },
  ARRIVED:     { IN_PROGRESS: "worker" },
  IN_PROGRESS: { COMPLETED: "worker" }
};

KAYA.INCIDENT_TYPES = {
  SAFETY_THREAT: "Safety threat",
  HARASSMENT: "Harassment",
  PROPERTY_DAMAGE: "Property damage",
  THEFT: "Theft",
  MEDICAL: "Medical emergency",
  OTHER: "Other"
};

/* Estimates: the worker inspects, submits an estimate, and cannot start
   (ARRIVED -> IN_PROGRESS) until the customer approves it. */
KAYA.SERVICE_FEE = 50;
KAYA.ESTIMATE_STATUS_LABELS = {
  SUBMITTED: "Awaiting customer approval",
  APPROVED: "Approved",
  REVISION_REQUESTED: "Revision requested"
};
KAYA.ESTIMATE_ALLOWED_STATUSES = ["ACCEPTED", "ON_THE_WAY", "ARRIVED"];

/* The customer pays while the job is in progress; the worker confirms the payment and
   only then marks the job COMPLETED. COMPLETED stays payable for older unpaid bookings. */
KAYA.PAYABLE_STATUSES = ["IN_PROGRESS", "COMPLETED"];
KAYA.PAYMENT_METHODS = { CASH: "Cash", GCASH: "GCash", QR: "QR Payment" };
KAYA.PAYMENT_STATUS_LABELS = { PENDING_CONFIRMATION: "Waiting for worker confirmation", PAID: "Paid" };

/* Warranty and rework: requested from a COMPLETED booking within WARRANTY_DAYS. */
KAYA.WARRANTY_DAYS = 30;
KAYA.WARRANTY_STATUS_LABELS = {
  OPEN: "Open",
  SCHEDULED: "Follow-up scheduled",
  RESOLVED: "Resolved by worker",
  DISPUTED: "Disputed — with KAYA",
  CLOSED: "Closed"
};

KAYA.CASE_STATUS_LABELS = { OPEN: "Open", INVESTIGATING: "Investigating", RESOLVED: "Resolved" };

KAYA.ISO_PATTERN =/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/;
KAYA.JOB_LENGTH_HOURS = 2;

window.KAYA = KAYA;
