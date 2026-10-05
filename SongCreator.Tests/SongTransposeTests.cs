using SongCreator.Models;

namespace SongCreator.Tests
{
    /// <summary>Transposing a whole song: only the chords move, spelled in the key they move to.</summary>
    public class SongTransposeTests
    {
        private static Song SongIn(string key, params string[] chords)
        {
            var song = new Song { Key = key };
            var section = new Section("Verse");
            var line = new SongLine("some lyrics");
            for (int i = 0; i < chords.Length; i++)
                line.Chords.Add(new ChordPlacement(i * 4, chords[i]));
            section.Lines.Add(line);
            song.Sections.Add(section);
            return song;
        }

        private static string[] Chords(Song song) => song.Sections[0].Lines[0].Chords.Select(c => c.Name).ToArray();

        [Fact]
        public void UpAndBackDownRestoresTheSameNames()
        {
            var song = SongIn("Bb", "Bb", "Eb", "F", "Gm/D", "Bbm7/F");

            song.Transpose(1);
            song.Transpose(-1);

            Assert.Equal(["Bb", "Eb", "F", "Gm/D", "Bbm7/F"], Chords(song));
        }

        [Fact]
        public void TheKeyStaysAsTheUserSetIt()
        {
            var song = SongIn("E", "E", "A", "B7", "C#m");

            song.Transpose(1);

            Assert.Equal("E", song.Key);
            Assert.Equal(["F", "Bb", "C7", "Dm"], Chords(song));
        }

        [Fact]
        public void ChordsAreSpelledByTheirOwnKeyNotTheKeyField()
        {
            // The field says G, but the chords are in E: they move to F, which is written with flats.
            var song = SongIn("G", "E", "A", "B7", "C#m");

            song.Transpose(1);

            Assert.Equal("G", song.Key);
            Assert.Equal(["F", "Bb", "C7", "Dm"], Chords(song));
        }

        [Fact]
        public void PrefersTheCommonKeyName()
        {
            var song = SongIn("C", "C", "F", "G", "Am");

            song.Transpose(1);

            Assert.Equal(["Db", "Gb", "Ab", "Bbm"], Chords(song));   // in Db, not C#
        }

        [Fact]
        public void BorrowedChordsAreSpelledConsistently()
        {
            // These chords point to G minor, which moves up to G# minor, written with sharps.
            var song = SongIn("G", "G", "Bb", "Eb/G", "D/F#");

            song.Transpose(1);

            Assert.Equal(["G#", "B", "E/G#", "D#/G"], Chords(song));
        }

        [Fact]
        public void WhenNoKeyStandsOutEachChordKeepsItsOwnSpelling()
        {
            var song = SongIn("", "Bb", "F#m", "D/F#");

            song.Transpose(2);

            Assert.Equal("", song.Key);
            Assert.Equal(["C", "G#m", "E/G#"], Chords(song));
        }

        [Fact]
        public void RareSpellingsTransposeToTheRightChord()
        {
            var song = SongIn("", "E#", "B#m", "Fb7", "Cb");

            song.Transpose(1);

            Assert.Equal(["F#", "C#m", "F7", "C"], Chords(song));
        }
    }
}
