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
(confirmations, password resets) are at http://127.0.0.1:54324. `..\scripts\web-dev.ps1` starts Docker
Desktop, the local Supabase and the app in one go, and `..\scripts\check.ps1` runs every check.

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
   - URL Configuration: the Site URL is your copy's address, and `https://<your address>/account` is
     a Redirect URL. The confirmation and password reset emails link there.
   - Email: keep "Confirm email" on, and set the minimum password length to 8, which the app asks for.
   - SMTP: Supabase's own sender is only for trying things out (a few emails an hour). Before others
     sign up, add an email service's SMTP settings.
   - In the Data API settings, keep the maximum rows at 1000: sync reads the account in pages of that size.

3. **Build the app** with the project's address and publishable key (Settings → API Keys). Set them as
   environment variables, which take the place of the local Supabase's in `apps/groovekeeper/.env`:

   ```powershell
   $env:VITE_SUPABASE_URL = 'https://<your project ref>.supabase.co'
   $env:VITE_SUPABASE_PUBLISHABLE_KEY = '<your publishable key>'
   npm run build
   Remove-Item Env:VITE_SUPABASE_*   # so `npm run dev` in this window uses the local Supabase again
   ```

   The publishable key is meant to be in the browser; access rules in the database decide what each
   account may read and change. Never put the secret (service role) key in the app. The build stops if
   these are missing or point at the local Supabase.

4. **Put `apps/groovekeeper/dist` on a static host** (Cloudflare Pages, Netlify, …), on HTTPS.
   Addresses like `/songs/…` belong to the app, so the host must answer them with
   `index.html`. Cloudflare Pages does that when the site has no `404.html`; other hosts need a
   rewrite rule. The build also writes `dist/_headers`, the security headers Cloudflare Pages sends with
   every page (a Content Security Policy that allows only the app's own files and your Supabase
   project); on another host, set the same headers in its own way.
