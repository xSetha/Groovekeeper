---
name: react-best-practices
description: Performance and correctness patterns for the Groovekeeper React app (Vite + React 19 SPA, Dexie, Supabase), including running as an installable PWA on phones. Use when writing or reviewing React components, hooks, data loading, sync, service worker or PWA code in web/, or when something is slow (typing lag, long lists, large bundle).
---

# React Best Practices (Groovekeeper web)

Groovekeeper's web app is a **client-only SPA**, also installed as a PWA on phones: Vite + React 19 + TypeScript, Tailwind, Dexie (IndexedDB) as the local store, Supabase later for accounts and sync. There is no server rendering, no Next.js, no React Server Components, so server-side patterns don't apply.

**Simplicity first.** These are patterns to reach for when they fit, not a checklist to apply everywhere. Don't add memoization, caching or code splitting without a reason: a measured problem (React DevTools Profiler, the Network tab, the build output) or code that is clearly hot, like the editor's per-keystroke path.

Priorities, highest impact first:

1. Async waterfalls (sync, imports, startup)
2. Bundle size
3. Re-renders, especially in the editor
4. Rendering long lists
5. JavaScript details

## 1. Eliminate async waterfalls

Sequential `await`s on independent work add up, especially against IndexedDB and, later, Supabase.

- **Run independent work in parallel** with `Promise.all`:
  ```ts
  // Slow: one after another
  const songs = await db.songs.toArray();
  const setlists = await db.setlists.toArray();

  // Fast: together
  const [songs, setlists] = await Promise.all([db.songs.toArray(), db.setlists.toArray()]);
  ```
- **Start early, await late.** Kick off a request before doing unrelated synchronous work, then await it where the result is needed.
- **Defer `await` into the branch that needs it**, so early returns don't wait for data they ignore.
- **Batch IndexedDB writes**: use `db.songs.bulkPut(...)` and a single `db.transaction(...)` for imports of many files instead of one `put` per song in a loop.
- **Sync (step 6):** push dirty songs and pull changes in as few round trips as possible; don't fetch per song.

## 2. Bundle size

- **Lazy-load routes and heavy, rarely used UI** with `React.lazy` + `<Suspense>` (the Vite equivalent of `next/dynamic`): the print view, setlist editor, account and settings screens, the Supabase client before sign-in.
  ```tsx
  const SetlistPage = lazy(() => import('./pages/SetlistPage'));
  ```
- **Import third-party libraries by path when they offer it**, and check the bundle after adding a dependency (`npm run build` prints chunk sizes). Importing from `@groovekeeper/core` is fine: it's our own small package and Vite tree-shakes it.
- **Preload on intent**: start `import('./pages/SongPage')` on hover/focus of a song link when it makes navigation noticeably faster.
- Prefer the platform and small libraries over large ones for small jobs.

## 3. Re-render optimization

The editor re-renders on every keystroke, so this matters most there.

- **Keep state as low as possible.** State used by one line belongs in that line, not in `SongEditor`.
- **Subscribe narrowly.** With Zustand, select only what a component uses (`useStore(s => s.song.key)`), not the whole store. With Dexie, give `useLiveQuery` a query that returns only what the component shows.
- **Derive, don't duplicate.** Compute values from props/state during render instead of copying them into extra state with effects (no `useEffect` that only sets state from other state).
- **Lazy initial state** for expensive values: `useState(() => parse(text))`, not `useState(parse(text))`.
- **`startTransition` / `useDeferredValue`** for non-urgent updates: filtering the library while typing in search, recomputing key detection after an edit.
- **Stable props for memoized children**: `memo` on editor line components only helps if callbacks and objects passed to them are stable (`useCallback` / `useMemo`) or the line receives only primitive props. Measure before and after.
- **Keys:** stable IDs, never array indexes, for lists that reorder (sections, setlist songs, chords on a line).

## 4. Rendering performance

- **Long lists** (a big library, long songs): `content-visibility: auto` with `contain-intrinsic-size` on rows is the cheapest win; virtualize only if that isn't enough.
- **Conditional rendering:** use `cond ? <X /> : null`, not `count && <X />`, which renders a stray `0`.
- **Batch DOM style changes** through classes (Tailwind) rather than setting several inline styles in a loop. Read layout (`getBoundingClientRect`) before writing, not interleaved, in chord-drag code.
- **Animate wrappers**: transform/opacity on a wrapper element rather than animating SVG attributes or layout properties.

## 5. JavaScript details

- **Index maps for repeated lookups:** build a `Map` by ID once instead of `array.find` inside a loop (e.g. matching setlist entries to songs).
- **Immutable array methods** on state: `toSorted()`, `toReversed()`, `with()` instead of `sort()`/`reverse()` that mutate in place.
- **Cache repeated pure work** (chord parsing, transposing a whole song) when it runs on every render; `useMemo` keyed on its inputs is usually enough.
- **Cheap checks first:** compare lengths before deep-comparing arrays.

## 6. PWA and phones

The app is installed on phones and must work offline. Phones have slower CPUs and less memory, so sections 1-4 matter more there.

- **Setup:** `vite-plugin-pwa` generates the service worker and manifest. The manifest needs `name`, `short_name`, `start_url`, `display: "standalone"`, `theme_color`, `background_color`, and icons at 192px and 512px plus a `maskable` icon (reuse `SongCreator/Assets`). Add an `apple-touch-icon` link for iOS.
- **The app shell is precached** so the app opens with no network. Never put network calls on the startup path; the library always comes from Dexie first, and sync runs in the background.
- **Updates must not interrupt editing.** Use `registerType: 'prompt'`: when a new version is ready, show "Update available" with a Reload button, and reload only when the user chooses (or nothing is being edited). Never auto-reload over unsaved changes.
- **Save before the app is killed.** Phones freeze and kill background apps without `beforeunload`. Flush pending autosaves on `visibilitychange` (when `document.visibilityState === 'hidden'`) and `pagehide`.
- **Keep the library from being cleared:** call `navigator.storage.persist()` after the first song is saved. Browsers, Safari especially, can clear storage of sites that aren't used for a while; installed apps are treated better, but sync and export are the real backup, so don't promise that local data is permanent.
- **Touch input:** use pointer events (or dnd-kit's touch/pointer sensors with an activation delay or distance) so one code path handles mouse and touch, and dragging doesn't block scrolling. Add `touch-action` on drag handles only.
- **Screen stays on while reading:** if a stage/reading mode is added, use the Screen Wake Lock API (`navigator.wakeLock.request('screen')`), re-request it when the app becomes visible again, and fail silently where unsupported.
- **Testing:** use the browser's device mode with CPU throttling for layout and speed. On a real phone, `npm run dev -- --host` run in `web/apps/groovekeeper` serves the app on the local network, but service workers and install only work over HTTPS or on localhost, so test installing and offline on a preview deploy (or `npm run build` + `npm run preview` behind an HTTPS tunnel).

## Review checklist

When reviewing React code here, look for, in order: sequential independent awaits; a large import on the startup path; editor components re-rendering on every keystroke for state they don't use; state copied with effects; index keys on reorderable lists; `&&` with numbers; mutation of state arrays; network calls on the startup path; edits that could be lost when the phone backgrounds the app or the app updates.
