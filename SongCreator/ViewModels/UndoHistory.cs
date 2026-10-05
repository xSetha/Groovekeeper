using System.Collections.Specialized;
using System.ComponentModel;
using System.Windows.Threading;
using SongCreator.Models;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// Undo and redo for one song. Every change to the song is watched; the changes made by one user action
    /// become one step once that action is done. Consecutive typing in the same field (or nudging the chords
    /// of one line) is merged into a single step.
    /// </summary>
    public class UndoHistory
    {
        private record State(string Title, string Artist, string Key, IReadOnlyList<Section> Sections, IReadOnlyList<SongNote> Notes);

        private readonly Song _song;
        private readonly Stack<State> _undo = new();
        private readonly Stack<State> _redo = new();
        private readonly List<Action> _unwatch = new();
        private State _current;
        private bool _pending;
        private object? _pendingKey;   // what the pending changes edited, if they can merge with the last step
        private object? _lastKey;
        private bool _restoring;

        public UndoHistory(Song song)
        {
            _song = song;
            _current = Capture();
            WatchAll();
        }

        /// <summary>
        /// Records the pending changes as a step. Runs by itself after each user action; call it directly to end
        /// a step early. With <paramref name="mergeable"/> false the step never merges with the one before.
        /// </summary>
        public void Commit(bool mergeable = true)
        {
            if (!_pending)
                return;
            _pending = false;
            object? key = mergeable ? _pendingKey : null;
            if (key == null || !Equals(key, _lastKey))
                _undo.Push(_current);
            _redo.Clear();
            _current = Capture();
            _lastKey = key;
        }

        public void Undo()
        {
            Commit();
            if (_undo.Count == 0)
                return;
            _redo.Push(_current);
            Restore(_undo.Pop());
        }

        public void Redo()
        {
            Commit();
            if (_redo.Count == 0)
                return;
            _undo.Push(_current);
            Restore(_redo.Pop());
        }

        // ---- Song state ----

        private State Capture() =>
            new(_song.Title, _song.Artist, _song.Key, _song.Sections.Select(s => s.Clone()).ToList(),
                _song.Notes.Select(n => n.Clone()).ToList());

        private void Restore(State state)
        {
            _current = state;
            _lastKey = null;
            _restoring = true;
            _song.Title = state.Title;
            _song.Artist = state.Artist;
            _song.Key = state.Key;
            // One by one rather than Clear(), so watchers of the collection see which sections went away.
            while (_song.Sections.Count > 0)
                _song.Sections.RemoveAt(_song.Sections.Count - 1);
            foreach (var section in state.Sections)
                _song.Sections.Add(section.Clone());   // the stored state itself is never edited
            while (_song.Notes.Count > 0)
                _song.Notes.RemoveAt(_song.Notes.Count - 1);
            foreach (var note in state.Notes)
                _song.Notes.Add(note.Clone());
            _restoring = false;
            WatchAll();
        }

        // ---- Watching every change ----

        private void Changed(object? mergeKey)
        {
            if (_restoring)
                return;
            if (!_pending)
            {
                _pending = true;
                _pendingKey = mergeKey;
                Dispatcher.CurrentDispatcher.BeginInvoke(DispatcherPriority.Background, () => Commit());
            }
            else if (!Equals(_pendingKey, mergeKey))
            {
                _pendingKey = null;
            }
        }

        private void WatchAll()
        {
            foreach (var unwatch in _unwatch)
                unwatch();
            _unwatch.Clear();

            Watch(_song, e => e.PropertyName switch
            {
                nameof(Song.DisplayTitle) => false,
                nameof(Song.Key) => null,
                _ => e.PropertyName,   // typing in the title or artist
            });
            Watch(_song.Sections);
            foreach (var section in _song.Sections)
            {
                Watch(section, _ => section);
                Watch(section.Lines);
                foreach (var line in section.Lines)
                {
                    Watch(line, _ => line);
                    Watch(line.Chords);
                    foreach (var chord in line.Chords)
                        // Typing moves the chords of its line, so a moved chord counts as editing that line.
                        Watch(chord, e => e.PropertyName == nameof(ChordPlacement.Position) ? line : null);
                }
            }
            Watch(_song.Notes);
            foreach (var note in _song.Notes)
                // Typing in a note merges into one step; moving it is a step of its own.
                Watch(note, e => e.PropertyName == nameof(SongNote.Text) ? note : null);
        }

        /// <summary><paramref name="mergeKey"/> names what a change edited (null: never merge, false: not an edit).</summary>
        private void Watch(INotifyPropertyChanged source, Func<PropertyChangedEventArgs, object?> mergeKey)
        {
            PropertyChangedEventHandler handler = (_, e) =>
            {
                object? key = mergeKey(e);
                if (key is not false)
                    Changed(key);
            };
            source.PropertyChanged += handler;
            _unwatch.Add(() => source.PropertyChanged -= handler);
        }

        private void Watch(INotifyCollectionChanged source)
        {
            NotifyCollectionChangedEventHandler handler = (_, _) =>
            {
                if (_restoring)
                    return;
                WatchAll();
                Changed(null);
            };
            source.CollectionChanged += handler;
            _unwatch.Add(() => source.CollectionChanged -= handler);
        }
    }
}
