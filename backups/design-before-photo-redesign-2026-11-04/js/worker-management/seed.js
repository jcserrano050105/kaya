/* Demo data for the Worker Management System. */
KAYA.seedWorkerManagement = function () {
  function worker(id, name, city, categories, skills, years, jobs, ratingAvg, ratingCount, extra) {
    var w = {
      worker_id: id,
      full_name: name,
      city: city,
      service_categories: categories,
      verified_skills: skills,
      certificates: [],
      years_experience: years,
      bio: "",
      identity_verified: true,
      application_status: "APPROVED",
      availability: "available",
      completed_jobs: jobs,
      rating_total: Math.round(ratingAvg * ratingCount * 10) / 10,
      rating_count: ratingCount,
      applied_at: "2025-02-03T09:00:00+08:00",
      review_note: "",
      account_status: "ACTIVE"
    };
    for (var k in extra) { w[k] = extra[k]; }
    return w;
  }

  /* Manila time, offset from now by the given hours, rounded to the hour: "2026-11-10T09:00:00+08:00". */
  function at(hours) {
    var d = new Date(Date.now() + 8 * 3600 * 1000 + hours * 3600 * 1000);
    d.setUTCMinutes(0, 0, 0);
    return d.toISOString().slice(0, 19) + "+08:00";
  }

  function history(statuses, startHours) {
    return statuses.map(function (s, i) { return { status: s, at: at(startHours + i * 0.5) }; });
  }

  function estimate(labor, materials, status, hours) {
    return {
      labor: labor, materials: materials, service_fee: KAYA.SERVICE_FEE, total: labor + materials + KAYA.SERVICE_FEE,
      note: "Includes replacement parts and cleanup.", status: status,
      submitted_at: at(hours), decided_at: status === "SUBMITTED" ? null : at(hours + 0.5), revision_note: ""
    };
  }

  var done = ["PENDING", "ACCEPTED", "ON_THE_WAY", "ARRIVED", "IN_PROGRESS", "COMPLETED"];

  var bookings = [
    {
      booking_id: "BK-000190", customer_id: "C001", customer_name: "Maria Santos", worker_id: "W014", worker_name: "Juan Dela Cruz",
      service_id: "plumbing", schedule: at(-240), location: { address: "12 Mabini St., Teachers Village", city: "Quezon City" },
      problem_description: "Kitchen faucet keeps dripping even when closed.", status: "COMPLETED", status_history: history(done, -240),
      estimate: estimate(450, 280, "APPROVED", -239),
      payment: { transaction_id: "PAY-000001", method: "GCASH", reference: "GC8K21Q4X9", amount: 780, status: "PAID", recorded_at: at(-236), confirmed_at: at(-235) },
      reviewed: true, review: { rating: 5, comment: "Fixed the leak quickly and explained the problem.", created_at: at(-230) },
      created_at: at(-260), updated_at: at(-237)
    },
    {
      booking_id: "BK-000195", customer_id: "C001", customer_name: "Maria Santos", worker_id: "W033", worker_name: "Ramon Santos",
      service_id: "electrical", schedule: at(-72), location: { address: "12 Mabini St., Teachers Village", city: "Quezon City" },
      problem_description: "Bedroom light switch sparks when turned on.", status: "COMPLETED", status_history: history(done, -72),
      estimate: estimate(400, 180, "APPROVED", -71), payment: null, reviewed: false, review: null,
      created_at: at(-90), updated_at: at(-69)
    },
    {
      booking_id: "BK-000199", customer_id: "C001", customer_name: "Maria Santos", worker_id: "W014", worker_name: "Juan Dela Cruz",
      service_id: "plumbing", schedule: at(-1), location: { address: "12 Mabini St., Teachers Village", city: "Quezon City" },
      problem_description: "Bathroom sink drain is clogged.", status: "ARRIVED", status_history: history(["PENDING", "ACCEPTED", "ON_THE_WAY", "ARRIVED"], -20),
      estimate: estimate(380, 120, "SUBMITTED", -0.5), payment: null, reviewed: false, review: null,
      created_at: at(-22), updated_at: at(-0.5)
    },
    {
      booking_id: "BK-000200", customer_id: "C001", customer_name: "Maria Santos", worker_id: "W021", worker_name: "Ana Reyes",
      service_id: "cleaning", schedule: at(26), location: { address: "12 Mabini St., Teachers Village", city: "Quezon City" },
      problem_description: "Deep cleaning for the kitchen and living room.", status: "PENDING", status_history: [{ status: "PENDING", at: at(-2) }],
      estimate: null, payment: null, reviewed: false, review: null,
      created_at: at(-2), updated_at: at(-2)
    }
  ];

  var warranty = [
    {
      warranty_id: "WR-000001", booking_id: "BK-000190", customer_id: "C001", worker_id: "W014", service_id: "plumbing",
      description: "The faucet started dripping again a week after the repair.", photo_count: 2, preferred_date: at(30).slice(0, 10),
      status: "DISPUTED", visit_date: "", resolution_note: "", dispute_reason: "Worker has not replied in 3 days.", admin_note: "",
      history: [{ status: "OPEN", at: at(-60), by: "customer" }, { status: "DISPUTED", at: at(-4), by: "customer" }],
      created_at: at(-60), updated_at: at(-4)
    }
  ];

  return {
    schema: 2,
    workers: [
      worker("W014", "Juan Dela Cruz", "Quezon City", ["plumbing"], ["plumbing", "faucet_repair"], 9, 86, 4.8, 64,
        { certificates: ["TESDA Plumbing NC II"], bio: "Leaks, faucets, and pipe repairs for homes in QC." }),
      worker("W021", "Ana Reyes", "Quezon City", ["cleaning", "laundry"], ["cleaning", "deep_cleaning", "laundry"], 6, 132, 4.9, 101,
        { bio: "Thorough home cleaning and laundry service.", applied_at: "2024-11-20T10:00:00+08:00" }),
      worker("W033", "Ramon Santos", "Manila", ["electrical"], ["electrical", "wiring", "outlet_repair"], 12, 57, 4.7, 40,
        { certificates: ["TESDA Electrical Installation and Maintenance NC II"], bio: "Licensed for residential wiring." }),
      worker("W038", "Liza Mendoza", "Makati", ["carpentry"], ["carpentry", "furniture_repair"], 4, 23, 4.5, 18,
        { bio: "Cabinet, shelf, and furniture repairs." }),
      worker("W042", "Pedro Bautista", "Pasig", ["gardening"], ["gardening", "lawn_mowing", "tree_trimming"], 7, 45, 4.6, 30,
        { availability: "busy", bio: "Garden upkeep and tree trimming." }),
      worker("W047", "Carlo Villanueva", "Quezon City", ["electrical", "plumbing"], ["electrical", "plumbing"], 3, 11, 4.3, 9,
        { identity_verified: false, bio: "Handyman for small electrical and plumbing jobs." }),
      worker("W051", "Grace Navarro", "Taguig", ["cleaning"], ["cleaning", "aircon_cleaning"], 5, 64, 4.8, 52,
        { bio: "Aircon and general home cleaning." }),
      worker("W060", "Mark Aquino", "Quezon City", ["carpentry"], ["carpentry", "door_repair"], 2, 0, 0, 0,
        { application_status: "PENDING", identity_verified: false, applied_at: "2026-10-30T14:00:00+08:00",
          bio: "Door and cabinet installation." }),
      worker("W061", "Joy Ramos", "Manila", ["laundry"], ["laundry", "ironing"], 1, 0, 0, 0,
        { application_status: "PENDING", identity_verified: true, applied_at: "2026-11-01T08:30:00+08:00",
          bio: "Wash, dry, iron, and fold." })
    ],
    bookings: bookings,
    warranty_requests: warranty,
    reviews: [
      { booking_id: "BK-000101", worker_id: "W014", rating: 5, comment: "Fixed the leak quickly and explained the problem.", created_at: "2026-10-12T15:20:00+08:00" },
      { booking_id: "BK-000102", worker_id: "W014", rating: 5, comment: "On time and very neat.", created_at: "2026-10-20T11:05:00+08:00" },
      { booking_id: "BK-000103", worker_id: "W021", rating: 5, comment: "The kitchen has never been this clean.", created_at: "2026-10-18T17:40:00+08:00" },
      { booking_id: "BK-000104", worker_id: "W033", rating: 4, comment: "Good work, arrived a little late.", created_at: "2026-10-05T13:10:00+08:00" },
      { booking_id: "BK-000190", worker_id: "W014", rating: 5, comment: "Fixed the leak quickly and explained the problem.", created_at: at(-230) }
    ],
    incidents: [],
    worker_reports: [],
    idempotency: {},
    counters: { booking: 200, incident: 0, report: 0, worker: 61, warranty: 1, payment: 1 }
  };
};
