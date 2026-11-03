# Supabase setup

1. **Create the project:** go to https://supabase.com, sign in, click **New project**, and pick the Singapore region (closest to the Philippines). Save the database password.
2. **Create the tables:** open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and click **Run**. Then do the same with `supabase/002_profile_email_linked_id.sql`, then `supabase/003_worker_management.sql`, then `supabase/004_verify_email_first.sql`, `supabase/005_worker_requirements.sql` and `supabase/006_location_pin.sql`. Run each file once, in that order, in an empty editor.
3. **Set up auth:** go to **Authentication → Providers → Email** and make sure it is enabled. Under **Authentication → URL Configuration**, set the Site URL to wherever the site is hosted. Supabase redirects don't work from `file://`; for local testing, run `npx serve .` and use `http://localhost:3000`.
4. **Connect the site:** copy the **Project URL** (click **Connect** at the top of the dashboard, or see **Project Settings → Data API**) and the **Publishable key** (`sb_publishable_...`, under **Project Settings → API Keys**) into `js/shared/supabase-config.js`. Never use a secret key (`sb_secret_...`) in the site.
5. **Library:** every page already loads supabase-js and `supabase-config.js` before `auth.js`.
6. **Create an admin:** sign up normally, then run this in the SQL Editor:
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

## What the database enforces
- Customers see only their own bookings, and workers see only the bookings assigned to them.
- Only admins can see all users or edit services.
- Sign-ups can choose only customer or worker. Users cannot change their own role or status.
- A job cannot move to `IN_PROGRESS` until its estimate is approved.
- Warranty requests can be made only on completed bookings that belong to the customer.

## How the site uses Supabase
- When the site is opened over http(s), `KAYA.Auth` uses Supabase for sign-up, log in, log out, password change and password reset. Opened from `file://`, it falls back to the browser-only demo accounts.
- **Sign-up verifies the email first.** The email field has a **Verify** button that sends a 6-digit code. The rest of the form can't be submitted until the code is confirmed. In **Authentication → Emails → Templates**, both **Confirm signup** and **Magic Link** must include `{{ .Token }}` so the email contains the code.
- Supabase's built-in email service sends only a few emails per hour. For real users, set up your own SMTP under **Authentication → Emails**.
- Accounts, profiles, worker applications, bookings, estimates, payments, reviews, warranty requests, incidents and worker reports are stored in Supabase. Every booking action goes through the database function `wm_api()`, which checks who is signed in and applies the booking rules. The browser cannot read or change these tables directly.
- Still saved per browser: the admin's service price and description edits, a customer's saved address and trusted contact, and the outage test switch.
- Supabase starts with no workers. Customers can't book until at least one worker registers at `worker-register.html` and an admin approves the application under **Worker Applications**.
