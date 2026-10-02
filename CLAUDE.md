# Groovekeeper

An app for writing chord sheets: a WPF desktop app (.NET 10), and a web version in progress in `web/`
(Vite + React 19 + TypeScript + Tailwind). The README describes the features, the file formats and
the project layout; `docs/WEB-PLAN.md` has the web plan and its progress.

The app was called SongCreator until 1.0.0. Users see Groovekeeper; the code (projects, folders,
namespaces), the Velopack package ID and the data folders in `%AppData%` and `%LocalAppData%` keep
the name SongCreator on purpose, so installed copies keep updating and keep their songs. Don't rename
those.

- Build and test the desktop app: `dotnet build`, `dotnet test`.
- **Web app:** run npm in `web/` with Windows Node; from WSL use `cmd.exe /c "npm test"`,
  `cmd.exe /c "npm run typecheck"`, `cmd.exe /c "npm run dev"`. `web/packages/core` is the TypeScript port
  of the desktop `Models`, `Music` and song formats; keep it free of React and browser APIs. Both apps run
  the golden cases in `shared/fixtures`: when a song or music rule changes, update the fixture and both
  implementations.
- **Changelog:** every change users will notice adds a line under `## [Unreleased]` in `CHANGELOG.md`,
  in the same commit, written for the people using the app. Changes only developers see (tests,
  refactoring, build and release scripts) don't go in. The format and the headings are in
  `docs/RELEASING.md`.
- **Releases:** the version numbering and the release steps are in `docs/RELEASING.md`. When asked to
  prepare a release, choose the version from the `[Unreleased]` entries and run
  `scripts/prepare-release.ps1 -Version X.Y.Z`; the user tags and pushes.
- **Screenshots:** after a visible change to the start page or the editor, offer to rerun
  `scripts/screenshots.ps1`. It swaps the user's library for the sample songs, so the app must be
  closed and the user must agree first.
