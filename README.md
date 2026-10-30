# My availability

A small, responsive, personal availability tracker. No calendar integrations, build
tools, or server to maintain. Mark days Free, Busy, or Undecided, add notes, edit a
date range, and export a JSON backup. Supabase stores your data behind sign-in and
row-level security.

## 1. Set up Supabase

1. Create a Supabase project.
2. Open SQL Editor and run `schema.sql` once.
3. In Authentication settings, disable new-user signups. Leave email authentication
   enabled. This app deliberately does not create accounts.
4. In Authentication > Users, use Add user > Create new user to create your own
   email account, with a strong random password and email auto-confirm enabled.
   The app uses email links instead of that password. Do not invite other users.
5. From the project's API settings/connect dialog, copy the project URL and
   **public anon key** or **publishable key** into `config.js`. These keys are
   intended to be public; the SQL policies protect your rows.
   **Never put a service_role key, secret key, password, or database connection
   string into this app or your GitHub repository.**

Dashboard labels can change. If a link email fails, inspect Supabase Auth logs;
you may need to configure a custom SMTP provider for reliable delivery. Supabase's
built-in mail service has delivery restrictions and rate limits.

## 2. Publish to your repository

Copy this folder's contents to your repository root. No npm install is required.

For GitHub Pages:

1. Commit and push the files.
2. In repository Settings > Pages, choose Deploy from a branch, select your branch
   and `/ (root)`, and save. Pages availability for private repositories depends on
   your GitHub plan. A public repository is fine: your availability is in Supabase,
   not in the repository. Never commit exported backups.
3. Copy the resulting URL, including its repository path and trailing slash, e.g.
   `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.
4. In Supabase Authentication > URL Configuration, set Site URL to that URL and add
   the same exact URL to Redirect URLs.
5. Open your app, enter the email account you created, and follow the sign-in link.
   Repeat on your other device to access the same data.

You can instead use any static HTTPS host. Add that site's URL to Supabase's
redirect allowlist. The browser loads the Supabase library from esm.sh, so an
internet connection is required. This is a mobile-friendly website, not an
offline-capable PWA.

## Local preview

Run `python3 -m http.server 8000` in this directory and open
`http://localhost:8000/`. Add that exact URL to Supabase Redirect URLs.
Do not open `index.html` directly as a file.

## Behavior and limitations

- Weeks start on Monday. Dates are local calendar dates, not UTC timestamps.
- Unmarked days are Undecided. Choosing Undecided deletes the saved status and note.
- Range editing replaces notes and statuses on all selected dates, up to 366 days.
- Saves go directly to Supabase. Other devices refresh when their window gains
  focus; use Refresh if the page is already open. There is no live push subscription.
- On concurrent edits to the same date, the last successful save wins.
- Export downloads all your saved dates and notes. Keep the file private.
  Import/restore is not implemented; export is a portable data copy.
- Anyone can see your app's static files if the host is public, but only your
  authenticated account can access your availability. Keep new-user signups
  disabled, protect your email account, and sign out on shared devices.
- Schema setup is a one-time migration, not a script to rerun on an existing table.

## Smoke check after setup

Sign in, mark one date Busy with a note, reload, and confirm it persists. Sign in
on a second device and confirm the same date appears. Change it to Free, then
Undecided, and refresh the first device. Finally, sign out and verify that the
calendar is no longer visible.