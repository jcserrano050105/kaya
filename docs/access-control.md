# KAYA — Public Website, Login and Role-Based Access

## Page map

| Page | Who can open it | Notes |
|---|---|---|
| `index.html` (Home) | Everyone | Animated service carousel, previews only — no private data |
| `services.html` | Everyone | Categories, prices and descriptions come from the admin-managed catalog |
| `how-it-works.html` | Everyone | The five-step process |
| `book.html` | Everyone can open it | Guests see **Log In / Create Customer Account**. Only a signed-in customer gets the booking form, which is built in JavaScript after the role check (it is not in the HTML). Workers and admins see *Access denied*. |
| `login.html` | Everyone | Customers and workers. Show/Hide password, Forgot Password, lockout |
| `register.html` | Everyone | Creates a **Customer** account, then redirects to the booking form |
| `worker-register.html` | Everyone | Creates a **Worker** account and submits the application together. The account shows **Pending Verification** until an admin approves it |
| `admin-login.html` | Not linked in any navigation | Only admin accounts can sign in here; `noindex` |
| `customer.html#…`, `bookings.html`, `booking.html`, `search.html`, `profile.html` | Customers only | |
| `worker.html#…` | Workers only | While pending, only *Dashboard* and *Profile* work; other views show a locked message |
| `admin.html#…` | Admins only | |

## Navigation per role

Rendered by `KAYA.Auth.renderNav()` from the session's role (`js/shared/auth.js`):

- **Public:** Home · Services · How It Works · Book a Service · Log In · Create Account
- **Customer:** Dashboard · Book a Service · My Bookings · Track Service · Payments · Warranty Requests · Reviews · Profile · Log Out
- **Worker:** Worker Dashboard · Booking Requests · My Schedule · Estimates · Service Progress · Payments · Warranty Requests · Digital Work Passport · Profile · Log Out
- **Admin:** Admin Dashboard · Worker Applications · Users · Services · Bookings · Complaints and Incidents · Warranty Disputes · Reports · Settings · Log Out

There is no Admin link anywhere in the public site.

## Access rules

Every private page calls `KAYA.Auth.guard(role)` in `<head>`, before the body renders:

| Situation | Result |
|---|---|
| Not signed in | Redirect to `login.html?next=…` (`admin-login.html` for admin pages) |
| Signed in with another role | *Access denied* message with a link to the user's own dashboard |
| URL edited to another dashboard | Same as above — the role is read from the account record, never from the URL or session object |
| Session expired, logged out in another tab, or page restored from the back button | Redirect to login |
| `?next=` points to another role's page or another site | Ignored; user goes to their own dashboard |

The Worker Management API enforces the same rules again for data: customers only see their own bookings, workers only their assigned jobs, and `/admin/*` routes return `403` for any non-admin.

## Security features

- Salted, iterated SHA-256 password hashes; passwords are never stored in plain text
- Password strength indicator; minimum 8 characters with uppercase, lowercase and a number
- Generic login errors (no hint whether an email exists); 5 failed attempts lock the email for 5 minutes
- Forgot Password gives the same reply for any email (no account discovery)
- Session tokens are random and must match the account; suspending or deactivating an account ends its sessions immediately
- Customer/worker sessions: 8 hours, or 14 days with "Keep me logged in". Admin sessions: 30 minutes, never remembered
- Secure logout removes the token and uses `location.replace` so private pages are not in the back history
- Changing a password signs out other devices

> **Prototype limitation:** this site runs entirely in the browser (localStorage), so anyone with developer tools could edit the stored data. The rules above show the intended behavior; a production deployment must enforce them on a server with HTTP-only session cookies and a real database.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Customer | maria@kaya.ph | Customer@123 |
| Worker (approved) | juan@kaya.ph | Worker@123 |
| Worker (approved) | ana@kaya.ph, ramon@kaya.ph | Worker@123 |
| Worker (Pending Verification) | mark@kaya.ph | Worker@123 |
| Admin (use `admin-login.html`) | admin@kaya.ph | Admin@2026! |

*Admin → Settings → Reset all data* restores these accounts and the sample bookings.
