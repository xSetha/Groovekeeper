---
paths:
  - "**/*.cs"
  - "**/*.xaml"
---

# SongCreator: C# and WPF standards

A WPF app on .NET 10 with MVVM, no framework. Match the patterns already in the code before adding new ones.

## MVVM

- Logic lives in view models (`ViewModels/`) and plain classes (`Models/`, `Music/`, `IO/`). Code-behind holds only view concerns: focus, drag and drop, scrolling, visual tree lookups.
- View models derive from `Models/ObservableObject` and set properties with `SetProperty(ref _field, value)`. Call `OnPropertyChanged` for computed properties that depend on them.
- Expose actions as `ICommand` using the existing `RelayCommand` / `RelayCommand<T>`. Don't add an MVVM library.
- View models never touch windows, `MessageBox`, or file dialogs. Go through `IDialogService`; add a method there (and to `FakeDialogService` in the tests) when a new dialog is needed.
- When a view model needs the view to do something visual (e.g. focus a box), raise an event the view subscribes to, like `FocusTitleRequested`.
- Every edit to a song must go through the model so `UndoHistory` sees it. Never change song state in a way that bypasses undo.

## UI thread

- Never block the UI thread: no `.Result`, `.Wait()`, or `Thread.Sleep`. Use async/await for anything slow (PDF export, reading many files).
- `async void` only for event handlers; everything else returns `Task`.
- Use `Dispatcher.BeginInvoke` with `DispatcherPriority.Loaded` to act after layout, as the existing code does.

## XAML and themes

- Colors and brushes come from the theme dictionaries via `{DynamicResource ...}`, never hard-coded, so theme switching works.
- A new resource key must be added to all three themes: `StudioDark.xaml`, `Aurora.xaml`, `Paper.xaml`.
- Reuse existing styles and converters before creating new ones.

## Music logic

- `Music/` is pure logic: no WPF types, no file access. Keep it that way so it stays easy to test.
- Chord spelling matters: transposition and keys must respell correctly (e.g. Db vs C#) rather than picking any enharmonic.

## Files and errors

- Songs stay plain `.txt` with chords on the line above the lyrics, readable in any text editor. Don't change the format without asking; existing song files must keep loading.
- Catch specific exceptions only, in the pattern the code already uses: `catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)`. Report to the user through `IDialogService.ShowError`; never swallow errors silently.
- Never throw base `Exception`. Use a specific type (`InvalidOperationException`, `JsonException`, ...) with a message that says what went wrong.
- Never overwrite or modify a user's song file except on an explicit save. Setlists never change song files.

## Code style

- Block-scoped namespaces (`namespace X { }`), matching existing files. Nullable is enabled: no `!` to silence warnings without a reason.
- Private fields `_camelCase`, `readonly` where possible. PascalCase for public members and types.
- No magic numbers or strings repeated across the code; use a named constant.
- Prefer small, clear methods, but don't split code into layers, interfaces, or abstractions the app doesn't need yet.
- XML doc comments (`/// <summary>`) where a member's purpose or behavior isn't obvious from its name, as in `IDialogService`. Regular comments explain why, not what.
- No commented-out code.

## Tests

- xUnit, in `SongCreator.Tests`. New logic in `Music/`, `IO/`, `Models/` and view models gets tests; views and code-behind don't need them.
- Test names are descriptive sentences in PascalCase, like the existing ones (`FollowsTheSongKey`, `StartsOnTheKeysRoot`).
- Test view models with `FakeDialogService`, never real dialogs.
- Run `dotnet.exe test` (from WSL) before calling a change done.
