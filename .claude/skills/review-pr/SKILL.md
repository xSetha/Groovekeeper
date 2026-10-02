---
name: review-pr
description: Reviews code changes in the Groovekeeper repo (C#/WPF desktop app and the React/TypeScript web app) against the project's own rules, and reports findings by severity. Use when the user asks to review code, a diff, a commit, a branch or a PR, or asks "what do you think of this code". Read-only; never edits files.
argument-hint: "[commit, range or branch - default: uncommitted changes]"
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git show *) Read Grep Glob
---

# Review

Review a change the way a careful teammate who knows this repo would: find real problems, say exactly where and how to fix them, and nothing else.

## Current state

Branch: !`git branch --show-current`

Uncommitted changes:
!`git status --short`

## 1. Pick what to review

- If the user gave a commit, range or branch (`$ARGUMENTS`), review that: `git show <commit>` or `git diff <range>`; for a branch, `git diff main...<branch>`.
- Otherwise review the uncommitted changes: `git diff HEAD` plus any new untracked files.
- If there are no uncommitted changes, review the last commit (`git show HEAD`) and say so.
- For large diffs, list the files first, then review them one area at a time. Read the surrounding code when a change can't be judged from the diff alone.

## 2. Load the project's rules

The conventions live in the repo, not in a separate conventions file. Read the ones that apply to the changed files:

- Always: `CLAUDE.md` (the SongCreator name that must not be renamed, the changelog rule, the shared fixtures).
- `.cs` / `.xaml`: `.claude/rules/csharp-wpf.md`.
- `web/**` (`.ts`, `.tsx`, `.css`): `.claude/skills/react-best-practices/SKILL.md`; for UI changes also `.claude/skills/frontend-design/SKILL.md`.

## 3. What to check, in order

1. **Correctness.** Bugs, wrong logic, unhandled cases. Think about the edge cases of this app: an empty song or section, a line with no chords, chords at the very start or end of a line, slash chords, sharps vs flats when transposing, transposing up and back down, very long lines, files that aren't songs, many songs at once.
2. **Data safety.** Can this lose or corrupt a user's songs? Song files written only on an explicit save; the `.txt` format still readable by both apps and older versions; edits that bypass undo; on the web, edits lost when the phone backgrounds the app or the app updates.
3. **Both apps stay in step.** A change to a song, chord or music rule must update `shared/fixtures` and both implementations (C# and `web/packages/core`). `web/packages/core` stays free of React and browser APIs.
4. **Project rules** from step 2.
5. **Error handling.** C#: specific exceptions, shown through `IDialogService`, never swallowed. Web: failed async work (Dexie, imports, later Supabase) is caught and shown to the user in plain words; no unhandled promise rejections.
6. **Types.** C#: no `!` to silence nullable warnings without a reason. TypeScript: no `any`, no `as` or non-null `!` without a comment saying why.
7. **Structure and naming.** C#: as in the rule file. React: components PascalCase, hooks `use*`, utilities camelCase; no props passed down more than two levels just to reach a child; no circular imports.
8. **Performance.** Only what matters: the editor's per-keystroke path, startup, long lists, bundle size. Memoization only where it's justified.
9. **Tests.** New or changed logic in `Music`/`IO`/`Models`/view models (C#) and `packages/core` or library/editor logic (web) has tests that would fail if the code were wrong.
10. **Changelog.** A change users will notice has a line under `## [Unreleased]` in `CHANGELOG.md`.

## 4. Report

For each finding:

- **Where:** `path/to/file:line`
- **What:** one sentence on what's wrong and why it matters.
- **Fix:** the suggested change, as a short code snippet when that's clearer than words.

Group findings by severity:

- **Must fix:** bugs, data loss, broken builds or tests, security problems, rule violations with real consequences.
- **Should fix:** convention breaks, missing tests or changelog lines, error handling gaps, clear performance problems.
- **Nit:** small style or naming points. Keep these few.

Rules for the report:

- Skip empty severity groups. Don't pad the review, don't praise, don't restate what the code does.
- Only report what you're confident about. If something might be a problem but depends on context you couldn't check, put it under a short **Questions** list instead.
- End with one line: the overall verdict (ready to commit, ready after the must-fix items, or needs rework) and whether tests were run. Don't run the test suites unless the user asks; offer to.
- Don't edit any files. Offer to fix the findings afterwards.
