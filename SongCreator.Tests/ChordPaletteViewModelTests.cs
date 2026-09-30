using SongCreator.Models;
using SongCreator.ViewModels;

namespace SongCreator.Tests
{
    public class ChordPaletteViewModelTests
    {
        private readonly Song _song = Song.CreateTemplate();

        [Fact]
        public void FollowsTheSongKey()
        {
            var palette = new ChordPaletteViewModel(_song);
            Assert.False(palette.HasKey);

            var changed = new List<string?>();
            palette.PropertyChanged += (_, e) => changed.Add(e.PropertyName);
            _song.Key = "Am";

            Assert.True(palette.HasKey);
            Assert.Equal("In Am", palette.KeyTitle);
            Assert.Equal("Am", palette.KeyChords[0]);
            Assert.Contains(nameof(ChordPaletteViewModel.KeyChords), changed);
        }

        [Fact]
        public void StartsOnTheKeysRoot()
        {
            _song.Key = "Ebm";
            Assert.Equal("Eb", new ChordPaletteViewModel(_song).SelectedRoot);
        }

        [Fact]
        public void RootChordsFollowTheSelectedRoot()
        {
            var palette = new ChordPaletteViewModel(_song) { SelectedRoot = "F#" };
            Assert.Equal(["F#", "F#m", "F#7"], palette.RootChords.Take(3));
        }

        [Fact]
        public void BassNoteMakesSlashChords()
        {
            var palette = new ChordPaletteViewModel(_song) { SelectedRoot = "G" };
            Assert.Equal(ChordPaletteViewModel.NoBass, palette.SelectedBass);
            Assert.Equal(ChordPaletteViewModel.NoBass, palette.BassOptions[0]);

            palette.SelectedBass = "B";
            Assert.Equal(["G/B", "Gm/B", "G7/B"], palette.RootChords.Take(3));
            Assert.All(palette.RootChords, chord => Assert.True(Music.Chord.IsValid(chord)));

            palette.SelectedBass = "G";                                   // same as the root: no slash
            Assert.Equal("G", palette.RootChords[0]);
        }

        [Fact]
        public void TracksChordsUsedInTheSong()
        {
            var palette = new ChordPaletteViewModel(_song);
            var line = _song.Sections[0].Lines[0];

            line.Chords.Add(new ChordPlacement(0, "G"));
            line.Chords.Add(new ChordPlacement(4, "C"));
            line.Chords.Add(new ChordPlacement(8, "G"));
            Assert.Equal(["G", "C"], palette.UsedChords);
            Assert.True(palette.HasUsedChords);

            line.Chords[1].Name = "Em";                                  // renamed
            Assert.Equal(["G", "Em"], palette.UsedChords);

            var chorus = new Section("Chorus");                           // new section, then new line in it
            _song.Sections.Add(chorus);
            chorus.Lines.Add(new SongLine("la").WithChord(0, "D"));
            Assert.Equal(["G", "Em", "D"], palette.UsedChords);

            _song.Sections.Remove(chorus);                                // removed again
            line.Chords.Clear();
            Assert.Empty(palette.UsedChords);
            Assert.False(palette.HasUsedChords);
        }

        [Fact]
        public void TracksChordsMovedBySplittingLines()
        {
            var palette = new ChordPaletteViewModel(_song);
            var document = new SongDocumentViewModel(_song);
            var line = _song.Sections[1].Lines[0];
            line.Text = "hello world";
            line.Chords.Add(new ChordPlacement(6, "Am"));

            document.SplitLine(line, 6);                                  // the chord moves to a new line
            _song.Sections[1].Lines[1].Chords[0].Name = "A7";

            Assert.Equal(["A7"], palette.UsedChords);
        }
    }
}
