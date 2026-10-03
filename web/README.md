# Groovekeeper on the web

The web version of Groovekeeper, in progress. It's an npm workspace; run the commands here, in `web/`,
with Node 24 or later.

```powershell
npm install          # once
npm run dev          # start the app at http://localhost:5173
npm test             # run the tests
npm run typecheck    # check the types
npm run build        # build the app into apps/groovekeeper/dist
npm run test:e2e     # end-to-end tests in Chrome (starts its own copy of the app on port 5174)
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
