# Groovekeeper on the web

The web version of Groovekeeper, in progress. It's an npm workspace; run the commands here, in `web/`,
with Node 24 or later.

```powershell
npm install          # once
npm run dev          # start the app at http://localhost:5173
npm test             # run the tests
npm run typecheck    # check the types
npm run build        # build the app into apps/groovekeeper/dist, for a host (see Running your own copy)
npm run build:e2e    # build it against the local Supabase, for trying the built app
npm run test:e2e     # end-to-end tests in Chrome, on the dev server (port 5174) and on the built app (5175)
```

The app keeps its songs in the browser (IndexedDB). Signed in, it also syncs them with the account, so
every device signed in to it has the same songs. Accounts and sync use [Supabase](https://supabase.com);
for development it runs locally in Docker (Docker Desktop must be running, with `docker` on the PATH):

```powershell
npm run db:start     # start the local Supabase (the first time downloads its images)
npm run db:stop      # stop it; its data is kept
npm run db:reset     # empty it and apply the migrations again
npm run test:db      # the database's access-rule tests
```

While it runs, Studio (tables, users) is at http://127.0.0.1:54323, and the emails it would send
(confirmations, password resets) are at http://127.0.0.1:54324. As on a hosted project, a new account
must confirm its email (open the link there), and the account forms carry a Turnstile check, locally
with Cloudflare's test key, which always passes. `..\scripts\web-dev.ps1` starts Docker Desktop, the
local Supabase and the app in one go, and `..\scripts\check.ps1` runs every check.

To start a browser over as a guest, sign out, or clear the site's data in the browser's developer tools.

| Folder | Contents |
| --- | --- |
| `apps/groovekeeper` | The React app (Vite, React 19, Tailwind CSS, Dexie for the library) |
| `packages/core` | Songs, chords, keys, transposing, key detection, Roman numerals, and the `.txt` and ChordPro formats: a TypeScript port of the desktop app's `Models`, `Music` and song file code. No React, no browser APIs |
| `supabase` | The accounts database: settings for the local Supabase, the migrations (tables and access rules) and their pgTAP tests |
| `e2e` | End-to-end tests with Playwright: a guest's library, and two devices syncing through one account |

The core is checked against the cases in [`../shared/fixtures`](../shared/fixtures), which the desktop
app's tests run too, and against the sample songs in `../samples/songs`. When a rule changes in one
app, change the fixture and both test suites show what to update.

## Running your own copy

The app is a static site: there's no server of its own. Accounts and sync need a Supabase project.

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (the free plan is enough to
   start). Then, here in `web/`, give the database its tables and access rules:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <your project's ref>   # the ref is in the project's address
   npx supabase db push                                   # applies supabase/migrations
   ```

2. **Set up sign-in** in the project's dashboard, under Authentication:
   - URL Configuration: the Site URL is your copy's address, and `https://<your address>/auth` is
     a Redirect URL. The emails' links (confirming an account or a new email, forgot password) land there.
   - Email: keep "Confirm email" on, and set the minimum password length to 8, which the app asks for.
   - SMTP: Supabase's own sender is only for trying things out (a few emails an hour). Before others
     sign up, add an email service's SMTP settings.
   - In the Data API settings, keep the maximum rows at 1000: sync reads the account in pages of that size.
   - Bot protection: turn on CAPTCHA protection with Turnstile, and give it the secret key of a Turnstile
     widget you add in the Cloudflare dashboard (Turnstile → Add widget, managed mode, your copy's domain).
     The app then sends a Turnstile token with every sign-in, sign-up and email it asks for.

3. **Build the app** with the project's address and publishable key (Settings → API Keys). Set them as
   environment variables, which take the place of the local Supabase's in `apps/groovekeeper/.env`:

   ```powershell
   $env:VITE_SUPABASE_URL = 'https://<your project ref>.supabase.co'
   $env:VITE_SUPABASE_PUBLISHABLE_KEY = '<your publishable key>'
   $env:VITE_TURNSTILE_SITE_KEY = '<the site key of your Turnstile widget>'
   $env:VITE_SITE_OPERATOR = '<your name, or the name you go by>'
   $env:VITE_CONTACT_EMAIL = '<an address people can write to about their data>'
   npm run build
   Remove-Item Env:VITE_*   # so `npm run dev` in this window uses the local settings again
   ```

   The privacy page (`/privacy`) names you and that address as the one keeping people's accounts; read
   it, and change `apps/groovekeeper/src/pages/PrivacyPage.tsx` if your copy keeps data differently.

   The publishable key is meant to be in the browser; access rules in the database decide what each
   account may read and change. Never put the secret (service role) key in the app. The build stops if
   any of these is missing, points at the local Supabase, or is one of the local stand-ins (Turnstile's
   test key, `privacy@example.com`).

   Each account holds up to 200 songs and 20 setlists, and a song up to 20,000 characters with 50 notes
   (5,000 characters together), so that one account can't fill a small database. The numbers are in the
   migration `supabase/migrations/20261007120000_account_limits.sql` and in
   `apps/groovekeeper/src/library/limits.ts`; change both to change them.

4. **Put `apps/groovekeeper/dist` on a static host** (Cloudflare Pages, Netlify, …), on HTTPS.
   Addresses like `/songs/…` belong to the app, so the host must answer them with
   `index.html`. Cloudflare Pages does that when the site has no `404.html`; other hosts need a
   rewrite rule. The build also writes `dist/_headers`, the security headers Cloudflare Pages sends with
   every page (a Content Security Policy that allows only the app's own files, your Supabase project
   and Turnstile); on another host, set the same headers in its own way.

### Deploying from GitHub Actions

`.github/workflows/ci.yml` can deploy for you after the checks pass on `main`. It stays off until the repository
variable `DEPLOY` is `true`. It runs in an environment named `production`, which holds:

- secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CLOUDFLARE_API_TOKEN` (Pages edit) and `CLOUDFLARE_ACCOUNT_ID`;
- variables: `SUPABASE_PROJECT_REF`, `CLOUDFLARE_PAGES_PROJECT`, and the build settings from step 3 above
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY`, `VITE_SITE_OPERATOR`, `VITE_CONTACT_EMAIL`).

The job applies the migrations the database lacks, stops if the database and the repo don't then have exactly the
same ones, builds, and publishes. The old app keeps running against the new database until the publish ends, so
every migration must work with the previous version of the app: add a column or table in one release, and
remove what is no longer used in a later one.

### Backups

The free Supabase plan has no backups of its own, so `.github/workflows/backup.yml` makes one every night
(03:17 UTC): it dumps the songs, the setlists and the accounts (`auth.users`, `auth.identities`), encrypts the dump
with an [age](https://github.com/FiloSottile/age) public key, and keeps it for 7 days as the run's `backup`
artifact. The repository is public, so only the owner of the private key can read a backup. The same run
asks the project for its health, which keeps it from pausing after a week of silence, and turns the workflow
on again, which GitHub otherwise turns off after 60 days without activity in the repository. The run fails, and
GitHub sends its usual email about a failed scheduled run, when the dump is tiny or lacks a table, or when the
database has passed 400 MB (the plan turns read-only at 500 MB). The workflow runs only in the repository
`xSetha/Groovekeeper`; a copy that wants backups changes that line.

Set up, once:

1. Make a key pair, and keep `groovekeeper-backup.key` somewhere safe and outside the repository. Without it a
   backup can't be read, and anyone who has it can read every backup.

   ```powershell
   age-keygen -o groovekeeper-backup.key      # prints "Public key: age1..."
   ```

2. In the `production` environment, add the variable `AGE_PUBLIC_KEY` (that public key) and the secret
   `SUPABASE_DB_URL`: the project's connection string for the **Session pooler** (Connect → Session pooler,
   with the database password filled in). The direct address needs IPv6, which Actions doesn't have.
3. Run the workflow once by hand (Actions → Backup → Run workflow) and check that it passes.

#### Restoring a backup

You need `psql`, `pg_restore` (Postgres 17's tools, or `docker run postgres:17`) and `age`.

1. Use a project that has the tables and is empty: a new project with `npx supabase db push` run on it, or the
   same project with its `public.songs` and `public.setlists` rows (and its accounts) removed.
2. Download the `backup` artifact from the run you want, unzip it, and decrypt it:

   ```powershell
   age -d -i groovekeeper-backup.key -o groovekeeper.dump groovekeeper-2026-10-09.dump.age
   ```

3. Load it, with the tables' own triggers off, since those would give every song a new version and time:

   ```powershell
   psql $DATABASE_URL -c "alter table public.songs disable trigger user" -c "alter table public.setlists disable trigger user"
   pg_restore --dbname $DATABASE_URL --data-only --no-owner --exit-on-error groovekeeper.dump
   psql $DATABASE_URL -c "alter table public.songs enable trigger user" -c "alter table public.setlists enable trigger user"
   ```

   `$DATABASE_URL` is the same connection string as above. Accounts, their passwords and their songs come back
   as they were at the time of the dump, versions and times included.

Devices that synced after the dump have newer songs than the restored database, and the app doesn't yet send
them again by itself. Until it does, don't have people sign out to fix it: signing out empties the device. Ask them
to use **Export library** first (in the library, or in Settings), so their songs can be imported again.
