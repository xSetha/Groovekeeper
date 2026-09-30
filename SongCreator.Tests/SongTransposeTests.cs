using SongCreator.Models;

namespace SongCreator.Tests
{
    /// <summary>Transposing a whole song: the key sets how every chord is spelled.</summary>
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

            Assert.Equal("Bb", song.Key);
            Assert.Equal(["Bb", "Eb", "F", "Gm/D", "Bbm7/F"], Chords(song));
        }

        [Fact]
        public void ChordsAreSpelledForTheNewKey()
        {
            var song = SongIn("E", "E", "A", "B7", "C#m");

            song.Transpose(1);

            Assert.Equal("F", song.Key);
            Assert.Equal(["F", "Bb", "C7", "Dm"], Chords(song));
        }

        [Fact]
        public void PrefersTheCommonKeyName()
        {
            var song = SongIn("C", "C", "F", "G", "Am");

            song.Transpose(1);

            Assert.Equal("Db", song.Key);
            Assert.Equal(["Db", "Gb", "Ab", "Bbm"], Chords(song));
        }

        [Fact]
        public void BorrowedChordsAreAllowedAndSpelledConsistently()
        {
            var song = SongIn("G", "G", "Bb", "Eb/G", "D/F#");

            song.Transpose(1);

            Assert.Equal("Ab", song.Key);
            Assert.Equal(["Ab", "B", "E/Ab", "Eb/G"], Chords(song));
        }

        [Fact]
        public void WithoutAKeyEachChordKeepsItsOwnSpelling()
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
