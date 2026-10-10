# Releasing Groovekeeper

Groovekeeper is shipped as a Windows installer built with [Velopack](https://velopack.io) and published on
[GitHub Releases](https://github.com/xSetha/SongCreator/releases). Installed copies check those releases
when they start, download a newer version in the background, and install it the next time they start.

## Version numbers

Versions follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`, for example `1.4.2`.

| Part | Raise it when a release… | Example |
| --- | --- | --- |
| `MAJOR` | can break something for people already using the app: the library (`library.db`) or song files change so that an older version can't read them any more, or a feature is removed | `1.4.2` → `2.0.0` |
| `MINOR` | adds something: a feature, a menu entry, a theme, a new file format | `1.4.2` → `1.5.0` |
| `PATCH` | only fixes bugs, without anything new | `1.4.2` → `1.4.3` |

Raising a part sets the parts after it back to 0. When a release has both fixes and features, it's a
`MINOR` release.

The rules that keep the updater working:

- **One place for the version:** `<Version>` in `SongCreator/SongCreator.csproj`. The app, the installer
  and the update packages all take it from there.
- **The tag is the version with a `v`:** `<Version>1.5.0</Version>` is released by the tag `v1.5.0`. The
  release workflow refuses to build when they don't match.
- **Versions only go up.** The updater only installs a version higher than the one installed.
- **A released version is never rebuilt.** Don't move or reuse a tag, or replace the files of a release.
  If a release has a bug, fix it and release the next `PATCH` version.
- **Never change the package ID** (`--packId SongCreator` in `scripts/release.ps1`). Installed copies
  only update from releases with the same ID. It's the app's old name; people see the title
  (`--packTitle Groovekeeper`), which can change.

## The changelog

[`CHANGELOG.md`](../CHANGELOG.md) says what changed in each version, written for the people using the
app ("Chords stay on their syllable when…"), not for developers. It follows
[Keep a Changelog](https://keepachangelog.com):

- Every change people will notice adds a line under `## [Unreleased]`, in the same commit as the
  change, under `### Added`, `### Changed`, `### Removed` or `### Fixed`. Changes only developers see
  (tests, refactoring, build scripts) don't go in.
- The headings decide the version number: anything under Added (or Changed, Removed) needs at least a
  `MINOR` release; only Fixed is a `PATCH` release; a change that breaks something is `MAJOR`.
- A release turns `## [Unreleased]` into `## [1.5.0] - 2026-11-14` and starts a new, empty
  `## [Unreleased]` above it.

## Making a release

1. Check that `main` has everything for the release and that the tests pass: `dotnet test`.
2. Retake the screenshots in `docs/screenshots` (the README shows them), so they match this version.
   Screenshots are only retaken here, once per release, not after each change. Close Groovekeeper
   first: the script runs the app on a sample library in place of yours and puts yours back
   afterwards.

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\screenshots.ps1
   ```

   Look at the pictures, then commit them as `docs: retake the screenshots for 1.5.0`. The next step
   refuses to run while there are uncommitted changes.

3. Choose the version from what's under `## [Unreleased]` in `CHANGELOG.md`, then let the script
   prepare the release:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\prepare-release.ps1 -Version 1.5.0
   ```

   It checks that 1.5.0 is the next version and that the changelog allows it (no `PATCH` release
   when there are Added, Changed or Removed entries), sets the version in
   `SongCreator/SongCreator.csproj`, renames `## [Unreleased]` to the version and today's date with a
   new empty `## [Unreleased]` above it, and commits both as `chore: release 1.5.0`.

4. Optional, but worth it for a bigger release: build the installer yourself and try it.

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\release.ps1
   ```

   It puts `Groovekeeper-Setup.exe` and `Groovekeeper-Portable.zip` in `artifacts\releases`.

5. Tag the commit and push both:

   ```powershell
   git tag v1.5.0
   git push origin main v1.5.0
   ```

Pushing the tag starts the **Release** workflow (`.github/workflows/release.yml`); follow it on the
repository's Actions tab. It checks the tag against the version and the changelog, runs the tests,
builds the installer with `scripts/release.ps1` and publishes the GitHub release `Groovekeeper 1.5.0`,
with the version's section of the changelog as its text and these files:

| File | What it's for |
| --- | --- |
| `Groovekeeper-Setup.exe` | The installer. This is the link to give people. |
| `Groovekeeper-Portable.zip` | The app without installing it; it updates itself too. |
| `SongCreator-1.5.0-full.nupkg`, `-delta.nupkg`, `releases.win.json`, `RELEASES` | Used by the updater. Leave them in the release. |

The installed apps pick up the release on their next start.

If you push the version commit and the tag in one push and no run appears on the Actions tab, push
the tag again: `git push origin :refs/tags/v1.5.0`, then `git push origin v1.5.0`. That's only safe
while the release doesn't exist yet.

## What the installer does

- Installs for the current user in `%LocalAppData%\SongCreator`, without asking for administrator
  rights, and adds shortcuts to the Start menu and the desktop. Uninstalling is done in Windows'
  Installed apps list.
- Brings its own .NET runtime (the app is published self-contained), so nothing else needs to be
  installed. The WebView2 Runtime used by Import from Web comes with Windows 10 and 11.
- The user's songs, setlists and settings are in `%AppData%\SongCreator`, outside the install folder,
  so updating or reinstalling keeps them.
- The install folder holds only the app. The error log and the Import from Web browser data are in
  `%LocalAppData%\Groovekeeper`, and the uninstall hook removes them: anything left in the install
  folder after an uninstall makes the next setup say the app is already installed.
- The install and data folders keep the app's old name, SongCreator, like the package ID.

The installer isn't code-signed yet, so Windows SmartScreen warns about it the first time: click
**More info**, then **Run anyway**.

## Third-party licenses

PDF export uses [QuestPDF](https://www.questpdf.com) under its Community License, which the app selects
in `SongCreator/IO/SongPdfWriter.cs` (`QuestPDF.Settings.License = LicenseType.Community`). The Community
License is free for individuals (below the revenue limit in its terms) and for open-source projects
under an OSI-approved license. If Groovekeeper is used by a company above that limit, it needs a paid
QuestPDF license; see the [QuestPDF license](https://github.com/QuestPDF/QuestPDF/blob/main/LICENSE.md).
