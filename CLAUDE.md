# SongCreator

A WPF app (.NET 10) for writing chord sheets. The README describes the features, the file formats and
the project layout.

- Build and test: `dotnet build`, `dotnet test`.
- **Changelog:** every change users will notice adds a line under `## [Unreleased]` in `CHANGELOG.md`,
  in the same commit, written for the people using the app. Changes only developers see (tests,
  refactoring, build and release scripts) don't go in. The format and the headings are in
  `docs/RELEASING.md`.
- **Releases:** the version numbering and the release steps are in `docs/RELEASING.md`. When asked to
  prepare a release, choose the version from the `[Unreleased]` entries and follow those steps.
