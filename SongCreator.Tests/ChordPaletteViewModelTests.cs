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
            Assert.Equal("Am", palette.KeyChords[0].Name);
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
            Assert.Equal(["F#", "F#m", "F#7"], palette.RootChords.Take(3).Select(c => c.Name));
        }

        [Fact]
        public void BassNoteMakesSlashChords()
        {
            var palette = new ChordPaletteViewModel(_song) { SelectedRoot = "G" };
            Assert.Equal(ChordPaletteViewModel.NoBass, palette.SelectedBass);
            Assert.Equal(ChordPaletteViewModel.NoBass, palette.BassOptions[0]);

            palette.SelectedBass = "B";
            Assert.Equal(["G/B", "Gm/B", "G7/B"], palette.RootChords.Take(3).Select(c => c.Name));
            Assert.All(palette.RootChords, chord => Assert.True(Music.Chord.IsValid(chord.Name)));

            palette.SelectedBass = "G";                                   // same as the root: no slash
            Assert.Equal("G", palette.RootChords[0].Name);
        }

        [Fact]
        public void TracksChordsUsedInTheSong()
        {
            var palette = new ChordPaletteViewModel(_song);
            var line = _song.Sections[0].Lines[0];

            line.Chords.Add(new ChordPlacement(0, "G"));
            line.Chords.Add(new ChordPlacement(4, "C"));
            line.Chords.Add(new ChordPlacement(8, "G"));
            Assert.Equal(["G", "C"], palette.UsedChords.Select(c => c.Name));
            Assert.True(palette.HasUsedChords);

            line.Chords[1].Name = "Em";                                  // renamed
            Assert.Equal(["G", "Em"], palette.UsedChords.Select(c => c.Name));

            var chorus = new Section("Chorus");                           // new section, then new line in it
            _song.Sections.Add(chorus);
            chorus.Lines.Add(new SongLine("la").WithChord(0, "D"));
            Assert.Equal(["G", "Em", "D"], palette.UsedChords.Select(c => c.Name));

            _song.Sections.Remove(chorus);                                // removed again
            line.Chords.Clear();
            Assert.Empty(palette.UsedChords.Select(c => c.Name));
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

            Assert.Equal(["A7"], palette.UsedChords.Select(c => c.Name));
        }

        [Fact]
        public void ChipsShowTheirNumeralAndWhetherTheyFitTheKey()
        {
            _song.Key = "G";
            var palette = new ChordPaletteViewModel(_song) { SelectedRoot = "C" };

            Assert.Equal(new PaletteChord("Am", "ii", true), palette.KeyChords[1]);
            Assert.Equal(new PaletteChord("Cm", "iv", false), palette.RootChords[1]);

            _song.Key = "";
            Assert.Equal(new PaletteChord("C", null, false), palette.RootChords[0]);
        }

        [Fact]
        public void SuggestsChordsAfterTheOnePlacedLast()
        {
            _song.Key = "G";
            var palette = new ChordPaletteViewModel(_song);
            var line = _song.Sections[0].Lines[0];
            Assert.False(palette.HasSuggestions);

            line.Chords.Add(new ChordPlacement(8, "G"));
            line.Chords.Add(new ChordPlacement(0, "D"));              // placed last, though earlier in the line

            Assert.Equal("After D", palette.SuggestionsTitle);
            Assert.Equal(["G", "Em", "C"], palette.SuggestedChords.Select(c => c.Name));
        }

        [Fact]
        public void OffersTheKeyTheChordsSuggest()
        {
            var palette = new ChordPaletteViewModel(_song);
            var line = _song.Sections[0].Lines[0];
            foreach (var (position, name) in new[] { (0, "Am"), (4, "F"), (8, "C"), (12, "G"), (16, "Am") })
                line.Chords.Add(new ChordPlacement(position, name));

            Assert.Equal("Am", palette.DetectedKey);
            Assert.True(palette.ShowKeySuggestion);

            palette.UseDetectedKeyCommand.Execute(null);
            Assert.Equal("Am", _song.Key);
            Assert.False(palette.ShowKeySuggestion);
        }

        [Fact]
        public void NoKeyOfferWhenTheSongIsAlreadyInItUnderAnotherSpelling()
        {
            _song.Key = "A#";
            var palette = new ChordPaletteViewModel(_song);
            _song.Sections[0].Lines[0].Chords.Add(new ChordPlacement(0, "Bb"));

            Assert.Equal("Bb", palette.DetectedKey);
            Assert.False(palette.ShowKeySuggestion);
        }
    }
}
