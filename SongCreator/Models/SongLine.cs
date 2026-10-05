using System.Collections.ObjectModel;
using SongCreator.Music;

namespace SongCreator.Models
{
    public class SongLine : ObservableObject
    {
        private string _text;

        public SongLine(string text = "")
        {
            _text = text;
        }

        public string Text
        {
            get => _text;
            set => SetProperty(ref _text, value);
        }

        public ObservableCollection<ChordPlacement> Chords { get; } = new();

        public SongLine Clone()
        {
            var copy = new SongLine(Text);
            foreach (var chord in Chords)
                copy.Chords.Add(new ChordPlacement(chord.Position, chord.Name));
            return copy;
        }

        /// <summary>
        /// Puts the chord <paramref name="name"/> above the letter at <paramref name="position"/>, renaming the chord
        /// already there; an empty name removes that chord. Returns false, and changes nothing, if the name isn't a chord.
        /// </summary>
        public bool SetChord(int position, string name)
        {
            name = name.Trim();
            var existing = Chords.FirstOrDefault(c => c.Position == position);
            if (name.Length == 0)
            {
                if (existing != null)
                    Chords.Remove(existing);
                return true;
            }
            if (!Chord.IsValid(name))
                return false;
            if (existing != null)
                existing.Name = name;
            else
                Chords.Add(new ChordPlacement(position, name));
            return true;
        }

        public SongLine WithChord(int position, string name)
        {
            Chords.Add(new ChordPlacement(position, name));
            return this;
        }

        /// <summary>
        /// Keeps chords attached to their letters when the text is edited at <paramref name="offset"/>.
        /// Call before updating <see cref="Text"/>. Chords past the end of the text are not over a letter,
        /// so they keep their column (typing lyrics under a chord-only line doesn't push them).
        /// </summary>
        public void ApplyTextChange(int offset, int removed, int added)
        {
            foreach (var chord in Chords)
            {
                if (chord.Position >= Text.Length)
                    continue;
                if (chord.Position >= offset + removed)
                    chord.Position += added - removed;
                else if (chord.Position > offset)
                    chord.Position = offset;
            }
        }

        /// <summary>
        /// Cuts this line at <paramref name="index"/> and returns a new line holding the tail text and its chords.
        /// </summary>
        public SongLine SplitAt(int index)
        {
            index = Math.Clamp(index, 0, Text.Length);
            var tail = new SongLine(Text[index..]);
            foreach (var chord in Chords.Where(c => c.Position >= index).ToList())
            {
                Chords.Remove(chord);
                tail.Chords.Add(new ChordPlacement(chord.Position - index, chord.Name));
            }
            Text = Text[..index];
            return tail;
        }

        /// <summary>
        /// Appends <paramref name="next"/> to the end of this line, text and chords.
        /// </summary>
        public void Append(SongLine next)
        {
            int shift = Text.Length;
            Text += next.Text;
            foreach (var chord in next.Chords)
                Chords.Add(new ChordPlacement(chord.Position + shift, chord.Name));
        }
    }
}
