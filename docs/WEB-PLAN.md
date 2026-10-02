# Web version plan

The plan for Groovekeeper on the web: Vite + React 19 + TypeScript + Tailwind + Supabase.
Progress is marked on each step.

## Context
You want a web version of Groovekeeper next to the WPF app, with a subset of the features,
accounts with cloud sync plus a guest mode, and the common logic shared with the desktop app where
possible. Chosen stack: Vite + React 19 + TypeScript + Tailwind CSS, Supabase (Postgres + Auth +
row-level security). No Next.js, no server of your own.

What the code looks like today (~5.6k lines in one WPF project):
- `SongCreator/Music` (chords, keys, transposing, key detection, Roman numerals, ~370 lines) and
  `SongCreator/Models` (Song, Section, SongLine, ChordPlacement, ~240 lines) are plain .NET.
- `SongCreator/IO`: `SongTextReader/Writer` and `ChordProReader/Writer` (~460 lines) are plain .NET.
  `SongLibrary` (SQLite), `SongPdfWriter` (QuestPDF), `WindowSettings` are desktop-only.
- View models and the editor control (`Controls/SongLineControl`) are WPF and get rebuilt for the web.

## Sharing logic with the desktop app
- One repo (monorepo): the .NET solution where it is, the web app in `web/`. No separate repo.
- A TypeScript app can't import C#, so the shared part is **the file formats and the tests**:
  `shared/fixtures` holds song files (`.txt`, ChordPro) with the expected parsed song as JSON,
  expected written text, transpose/Roman-numeral tables and key-detection cases.
  xUnit and Vitest both run every fixture.
- The C# Models/Music/formats are ported once to `web/packages/core` (plain TS, no React).
- Songs are stored as their `.txt` text in Supabase (as `library.db` does), so a song written by
  either app reads the same in the other.

## Stack
| Part | Choice |
| --- | --- |
| Build | Vite + React 19 + TypeScript (strict), npm workspaces |
| Styling | Tailwind CSS; the four themes as CSS variables that Tailwind colors point to |
| Shared logic | `web/packages/core` |
| State + undo | Zustand + Immer (undo/redo as immutable snapshots/patches) |
| Drag & drop | dnd-kit (chords onto words, setlist order) |
| Routing | React Router |
| Guest storage | Dexie (IndexedDB) |
| Accounts + sync | Supabase Auth (email + password, Google later) + Postgres + RLS via `@supabase/supabase-js` |
| Schema | SQL migrations in `supabase/migrations`, run with the Supabase CLI (local Supabase in Docker for dev) |
| PDF | Print stylesheet + browser "Save as PDF" |
| Offline / install | `vite-plugin-pwa` |
| Tests | Vitest (+ Testing Library), Playwright for a few end-to-end flows |
| Hosting | Static site (Cloudflare Pages, Netlify, Vercel or GitHub Pages) + a Supabase project |

## Repo layout
```
SongCreator/, SongCreator.Tests/   unchanged WPF app and tests (+ a fixture-runner test class)
shared/fixtures/                   golden test cases
web/
  packages/core/                   models, chords, keys, transpose, key detection, Roman numerals,
                                   .txt + ChordPro readers/writers
  apps/groovekeeper/               the React app
  supabase/migrations/             tables, RLS policies
```

## Data, sync and guest mode
- PWA (`vite-plugin-pwa`): installable on desktop and phone, the app itself loads offline.
- Local-first: Dexie is always the store the app reads and writes, for guests and signed-in users
  alike. Signed in, a sync step pushes songs changed locally (a `dirty` flag) and pulls rows
  changed since the last sync (`updated_at > lastSync`), on start, on save and when the browser
  comes back online. So signed-in users can also edit offline.
- Tables: `songs(id uuid, owner_id, title, artist, key, text, version, updated_at)`,
  `setlists(id, owner_id, name, …)`, `setlist_songs(setlist_id, song_id, position, key)`.
- RLS on every table: a user can only select/insert/update/delete rows where
  `owner_id = auth.uid()` (setlist_songs through its setlist).
- Pushing updates with `where version = expected`; zero rows updated means someone else saved first,
  and the app asks which copy to keep. Otherwise last write wins.
- Signing up from guest mode offers to upload the guest library.

## First version scope
In: library with search, editor (chord lane, drag chords, sections, repeats), transpose, chord
palette, Roman numerals, undo/redo, import/export `.txt` and ChordPro, setlists with per-song key,
print/PDF, themes, guest mode, accounts + sync.
Out for now: import from web (copyright risk on a public site), PDF table of contents, old
`.setlist` import, find & replace.

## Steps
Done one at a time: each step is its own commit (the user pushes), with a stop after each one to try it
and adjust the next step before starting it. Run npm from Windows Node (in WSL: `cmd.exe /c "npm …"`).

1. ✅ **Golden fixtures.** (dbb26f8) `shared/fixtures` from `samples/songs` and existing xUnit cases; an xUnit
   test runs them against the C# code. → verify: `dotnet test` green. No changelog line (dev-only).
2. ✅ **Port core to TS.** (6253036) `web/packages/core`, driven by the fixtures.
   → verify: `npm test` in `web/` green on every fixture.
3. ✅ **Guest-mode app.** (ab0c153) Transposing saves immediately until the editor brings undo; no New song yet. Vite + React + Tailwind scaffold, library, song view, transpose,
   import/export, Dexie, one theme.
   → verify: import a sample song, transpose, reload, it's still there; export matches the desktop's output.
4. ⏭️ **Editor (in progress).** Prototype done (1ea463d): typing with chords anchored, Enter/Backspace/Up/Down, palette drag, chord drag sideways, right-click delete, autosave. Autosave confirmed by the user. Reviewed against the react-best-practices and frontend-design skills and fixed: stable ids as keys, save when the app is hidden, tap a chord then Remove (touch), touch drags start after a short hold so swiping scrolls, 44px touch targets, 16px search on phones, logo colors as theme tokens, persistent storage requested. Decided with the user: on a phone the app is read only (library and a reading view with transpose for viewing only; no import, delete or editing; songs will come by sync), done in this step. Next: a test on a real phone, then the store (Zustand + Immer) so each line re-renders only for its own changes, and with it undo/redo, sections (rename, move, duplicate, delete, repeat, add), title/artist/key editing, New song, multi-line paste. Chord lane over monospace lyrics, anchoring via the ported
   `SongLine.ApplyTextChange/SplitAt/Append`, sections, undo. Largest and riskiest step: prototype early.
   → verify: component tests + editing the sample songs by hand.
5. **Setlists, palette, print stylesheet, the other three themes.**
6. **Accounts + sync.** Supabase migrations + RLS, Auth UI, sync step (push dirty, pull since),
   guest upload, conflict prompt.
   → verify: RLS tests against local Supabase (signed-out and other-user access denied); two
   browsers on one account see each other's edits; an edit made offline syncs when back online;
   a stale push shows the conflict prompt.
7. **Deploy.** Static hosting + Supabase project; CI running `dotnet test` and `npm test` on push.
