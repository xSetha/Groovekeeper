# Groovekeeper on the web

The web version of Groovekeeper, in progress. It's an npm workspace; run the commands here, in `web/`,
with Node 24 or later.

```powershell
npm install          # once
npm run dev          # start the app at http://localhost:5173
npm test             # run the tests
npm run typecheck    # check the types
npm run build        # build the app into apps/groovekeeper/dist
```

The app keeps its songs in the browser (IndexedDB), so each browser has its own library. To start over,
clear the site's data in the browser's developer tools.

| Folder | Contents |
| --- | --- |
| `apps/groovekeeper` | The React app (Vite, React 19, Tailwind CSS, Dexie for the library) |
| `packages/core` | Songs, chords, keys, transposing, key detection, Roman numerals, and the `.txt` and ChordPro formats: a TypeScript port of the desktop app's `Models`, `Music` and song file code. No React, no browser APIs |

The core is checked against the cases in [`../shared/fixtures`](../shared/fixtures), which the desktop
app's tests run too, and against the sample songs in `../samples/songs`. When a rule changes in one
app, change the fixture and both test suites show what to update.
