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
4. ✅ **Editor.** Typing with chords kept on their letters, Enter/Backspace/Up/Down, chords dragged from a palette and sideways (touch: hold, then drag; tap a chord for Remove), autosave, undo/redo (Ctrl+Z/Y, a word per step), sections (add, rename, move, duplicate, repeat, delete, + Line), title/artist/key with a key suggestion, New song, pasting a whole song. The song lives in a Zustand store; typing re-renders only the line typed in (checked by test/rerender.test.tsx). On phones the app is read only (library + reading view).
5. ⏭️ **Palette, themes, setlists, printing (in progress).**
   - ✅ Full chord palette: after the last chord, in the key, in the song, every type on any root with a
     bass note, Roman numerals on the chips; the I IV V toggle shows the song's chords as numerals (cc24034).
   - ✅ Backstage, Record Sleeve and Songbook themes with a picker in the top bar; colors are `--gk-*`
     variables behind Tailwind's `@theme inline` tokens, each theme set once in `index.css` (a3e2b7a, 5f350fb).
   - ✅ Setlists (9490eba): songs in playing order with a key each ("+2 from G"), drag or arrows to
     reorder, added from the library; each entry has its own id (database version 3). On a phone a setlist
     opens to play, each song in its setlist key with previous/next at the bottom.
   - ⏭️ **Next: printing and PDF through the browser.** One song, several songs as a songbook, a setlist
     with each song in its key (marked like the desktop: "Key of E (+4 semitones from the original)"),
     and "Collapse repeated sections" (a section identical to an earlier one with the same name prints as
     `[Chorus] (repeat)`). A print stylesheet and the browser's Save as PDF; no PDF library.
6. **Accounts + sync.** Supabase migrations + RLS, Auth UI, sync step (push dirty, pull since),
   guest upload, conflict prompt.
   → verify: RLS tests against local Supabase (signed-out and other-user access denied); two
   browsers on one account see each other's edits; an edit made offline syncs when back online;
   a stale push shows the conflict prompt.
7. **Deploy.** Static hosting + Supabase project; CI running `dotnet test` and `npm test` on push.
   Before or with it: the PWA (manifest, offline app shell, "Update available" prompt, safe-area padding).

## Decisions and how we work

- **Phones are read only:** the library, the reading view (lyrics fitted to the screen, transpose for
  viewing only) and setlists to play. Writing songs is for computers and tablets. A phone is
  `PHONE_QUERY` in `src/phone.ts`.
- **Web-friendly before matching the desktop:** the web app may look different; only the song formats
  and music rules (shared/fixtures) must match.
- **Autosave** instead of a Save button; undo/redo covers mistakes.
- **No changelog lines for web changes** until the first web release.
- **Commits:** the `git-commit` skill (no AI attribution, files staged by name). Before committing a
  change over 200 lines (not counting tests, fixtures and lock files), run the `review-pr` skill and fix
  what it finds. The user pushes.
- **Web code** follows the `react-best-practices` and `frontend-design` skills; load them at the start of
  each step. Check UI in a real browser (headless Chrome via playwright-core, installed with --no-save)
  at desktop and phone size.
- **Backend:** none of our own. Business logic stays in the browser (`packages/core`, `src/editor/edit.ts`,
  `src/library/`); Supabase in step 6 holds the data and enforces ownership with RLS. Step 6's risks are
  sync conflicts and RLS rules: test both thoroughly.
- **Open question for step 6:** should band members share setlists or songs? If so, plan the sharing
  rules before building sync.
