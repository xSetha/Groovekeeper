using System.IO;
using System.Text.Json.Nodes;
using SongCreator.IO;
using SongCreator.Models;
using SongCreator.Music;

namespace SongCreator.Tests
{
    /// <summary>
    /// Runs the cases in shared/fixtures, which the web app's core package runs too (see shared/fixtures/README.md).
    /// </summary>
    public class SharedFixturesTests
    {
        private static readonly string Fixtures = Path.Combine(AppContext.BaseDirectory, "fixtures");

        private static string ReadFixture(params string[] path) =>
            File.ReadAllText(Path.Combine([Fixtures, .. path])).Replace("\r\n", "\n");

        /// <summary>The cases of a music fixture, each as its JSON text (one test per case).</summary>
        private static TheoryData<string> Cases(string file, string? list = null)
        {
            var root = JsonNode.Parse(ReadFixture("music", file))!;
            var cases = new TheoryData<string>();
            foreach (var item in (list == null ? root : root[list]!).AsArray())
                cases.Add(item!.ToJsonString());
            return cases;
        }

        private static JsonNode Case(string json) => JsonNode.Parse(json)!;

        private static string[] Strings(JsonNode? node) => node!.AsArray().Select(n => n!.GetValue<string>()).ToArray();

        // ---- songs/ ----

        public static TheoryData<string> SongFiles()
        {
            var files = new TheoryData<string>();
            foreach (string path in Directory.GetFiles(Path.Combine(Fixtures, "songs")).Where(p => !p.EndsWith(".json")))
                files.Add(Path.GetFileName(path));
            return files;
        }

        [Fact]
        public void FixturesAreCopiedForTesting()
        {
            Assert.NotEmpty(SongFiles());
        }

        [Theory]
        [MemberData(nameof(SongFiles))]
        public void ReadsAndWritesSongFile(string fileName)
        {
            string extension = Path.GetExtension(fileName);
            string stem = Path.GetFileNameWithoutExtension(fileName);
            string mode = Path.GetExtension(stem);   // ".in", ".out" or "" (both ways)
            string baseName = mode is ".in" or ".out" ? Path.GetFileNameWithoutExtension(stem) : stem;
            bool chordPro = extension == ".cho";

            string fileText = ReadFixture("songs", fileName);
            var expected = JsonNode.Parse(ReadFixture("songs", baseName + ".json"))!;

            if (mode != ".out")
            {
                var song = chordPro ? ChordProReader.Parse(fileText) : SongTextReader.Parse(fileText);
                Assert.Equal(expected.ToJsonString(), ToJson(song).ToJsonString());
            }
            if (mode != ".in")
            {
                var song = FromJson(expected);
                string written = chordPro ? ChordProWriter.ToText(song) : SongTextWriter.ToText(song);
                Assert.Equal(fileText, written.Replace("\r\n", "\n"));
            }
        }

        private static JsonObject ToJson(Song song) => new()
        {
            ["title"] = song.Title,
            ["artist"] = song.Artist,
            ["key"] = song.Key,
            ["sections"] = new JsonArray(song.Sections.Select(section => (JsonNode)new JsonObject
            {
                ["name"] = section.Name,
                ["repeat"] = section.IsRepeat,
                ["lines"] = new JsonArray(section.Lines.Select(line => (JsonNode)new JsonObject
                {
                    ["text"] = line.Text,
                    ["chords"] = new JsonArray(line.Chords.Select(chord => (JsonNode)new JsonObject
                    {
                        ["position"] = chord.Position,
                        ["name"] = chord.Name,
                    }).ToArray()),
                }).ToArray()),
            }).ToArray()),
        };

        private static Song FromJson(JsonNode json)
        {
            var song = new Song
            {
                Title = (string)json["title"]!,
                Artist = (string)json["artist"]!,
                Key = (string)json["key"]!,
            };
            foreach (var sectionJson in json["sections"]!.AsArray())
            {
                var section = new Section((string)sectionJson!["name"]!, (bool)sectionJson["repeat"]!);
                foreach (var lineJson in sectionJson["lines"]!.AsArray())
                {
                    var line = new SongLine((string)lineJson!["text"]!);
                    foreach (var chordJson in lineJson["chords"]!.AsArray())
                        line.WithChord((int)chordJson!["position"]!, (string)chordJson["name"]!);
                    section.Lines.Add(line);
                }
                song.Sections.Add(section);
            }
            return song;
        }

        // ---- music/chords.json ----

        public static TheoryData<string> ChordParseCases() => Cases("chords.json", "parse");
        public static TheoryData<string> InvalidChordCases() => Cases("chords.json", "invalid");
        public static TheoryData<string> PitchClassCases() => Cases("chords.json", "pitchClass");

        [Theory]
        [MemberData(nameof(ChordParseCases))]
        public void SplitsChordIntoRootTypeAndBass(string json)
        {
            var c = Case(json);
            string text = (string)c["text"]!;
            Assert.True(Chord.TryParse(text, out var chord));
            Assert.Equal((string)c["root"]!, chord.Root.ToString());
            Assert.Equal((string)c["quality"]!, chord.Quality);
            Assert.Equal((string?)c["bass"], chord.Bass?.ToString());
            Assert.Equal((string)c["triad"]!, chord.Triad.ToString().ToLowerInvariant());
            Assert.Equal(text, chord.ToString());
        }

        [Theory]
        [MemberData(nameof(InvalidChordCases))]
        public void RejectsWhatIsNotAChord(string json)
        {
            Assert.False(Chord.IsValid(Case(json).GetValue<string>()));
        }

        [Theory]
        [MemberData(nameof(PitchClassCases))]
        public void RareSpellingHasTheRightPitch(string json)
        {
            var c = Case(json);
            Assert.True(Chord.TryParse((string)c["note"]!, out var chord));
            Assert.Equal((int)c["pitchClass"]!, chord.Root.PitchClass);
        }

        // ---- music/transpose.json ----

        public static TheoryData<string> ChordTransposeCases() => Cases("transpose.json", "chords");
        public static TheoryData<string> KeyTransposeCases() => Cases("transpose.json", "keys");
        public static TheoryData<string> UsesFlatsCases() => Cases("transpose.json", "usesFlats");
        public static TheoryData<string> SongTransposeCases() => Cases("transpose.json", "songs");

        [Theory]
        [MemberData(nameof(ChordTransposeCases))]
        public void TransposesChord(string json)
        {
            var c = Case(json);
            Assert.Equal((string)c["expected"]!, ChordTransposer.Transpose((string)c["chord"]!, (int)c["semitones"]!, (bool?)c["useFlats"]));
        }

        [Theory]
        [MemberData(nameof(KeyTransposeCases))]
        public void TransposedKeyGetsItsUsualName(string json)
        {
            var c = Case(json);
            Assert.Equal((string)c["expected"]!, MusicKeys.Transpose((string)c["key"]!, (int)c["semitones"]!));
        }

        [Theory]
        [MemberData(nameof(UsesFlatsCases))]
        public void KnowsWhichKeysUseFlats(string json)
        {
            var c = Case(json);
            Assert.Equal((bool?)c["expected"], MusicKeys.UsesFlats((string)c["key"]!));
        }

        [Theory]
        [MemberData(nameof(SongTransposeCases))]
        public void TransposesSongInItsNewKey(string json)
        {
            var c = Case(json);
            var song = new Song { Key = (string)c["key"]! };
            var line = new SongLine("some lyrics");
            string[] chords = Strings(c["chords"]);
            for (int i = 0; i < chords.Length; i++)
                line.WithChord(i * 4, chords[i]);
            var section = new Section("Verse");
            section.Lines.Add(line);
            song.Sections.Add(section);

            foreach (var step in c["steps"]!.AsArray())
                song.Transpose((int)step!);

            Assert.Equal((string)c["expectedKey"]!, song.Key);
            Assert.Equal(Strings(c["expectedChords"]), line.Chords.Select(chord => chord.Name));
        }

        // ---- music/roman-numerals.json, key-detection.json ----

        public static TheoryData<string> RomanNumeralCases() => Cases("roman-numerals.json");
        public static TheoryData<string> KeyDetectionCases() => Cases("key-detection.json");

        [Theory]
        [MemberData(nameof(RomanNumeralCases))]
        public void WritesRomanNumeral(string json)
        {
            var c = Case(json);
            Assert.Equal((string?)c["expected"], RomanNumerals.Of((string)c["chord"]!, (string)c["key"]!));
        }

        [Theory]
        [MemberData(nameof(KeyDetectionCases))]
        public void DetectsKey(string json)
        {
            var c = Case(json);
            Assert.Equal((string?)c["expected"], KeyDetector.Detect(Strings(c["chords"])));
        }

        // ---- music/chord-theory.json ----

        public static TheoryData<string> DiatonicChordsCases() => Cases("chord-theory.json", "diatonicChords");
        public static TheoryData<string> RootOfCases() => Cases("chord-theory.json", "rootOf");
        public static TheoryData<string> FitsKeyCases() => Cases("chord-theory.json", "fitsKey");
        public static TheoryData<string> SuggestNextCases() => Cases("chord-theory.json", "suggestNext");

        [Theory]
        [MemberData(nameof(DiatonicChordsCases))]
        public void ListsTheChordsOfAKey(string json)
        {
            var c = Case(json);
            Assert.Equal(Strings(c["expected"]), ChordTheory.DiatonicChords((string)c["key"]!));
        }

        [Theory]
        [MemberData(nameof(RootOfCases))]
        public void RootOfUsesThePaletteSpelling(string json)
        {
            var c = Case(json);
            Assert.Equal((string?)c["expected"], ChordTheory.RootOf((string)c["key"]!));
        }

        [Theory]
        [MemberData(nameof(FitsKeyCases))]
        public void ChordFitsKeyByRootAndTriad(string json)
        {
            var c = Case(json);
            Assert.Equal((bool)c["expected"]!, ChordTheory.FitsKey((string)c["chord"]!, (string)c["key"]!));
        }

        [Theory]
        [MemberData(nameof(SuggestNextCases))]
        public void SuggestsWhatUsuallyComesNext(string json)
        {
            var c = Case(json);
            Assert.Equal(Strings(c["expected"]), ChordTheory.SuggestNext((string)c["chord"]!, (string)c["key"]!));
        }

        // ---- music/printing.json ----

        public static TheoryData<string> RepeatedSectionCases() => Cases("printing.json", "repeatedSections");
        public static TheoryData<string> KeyChangeNoteCases() => Cases("printing.json", "keyChangeNotes");

        [Theory]
        [MemberData(nameof(RepeatedSectionCases))]
        public void FindsRepeatedSections(string json)
        {
            var c = Case(json);
            var song = SongTextReader.Parse((string)c["song"]!);
            var expected = c["expected"]!.AsArray().Select(n => song.Sections[n!.GetValue<int>()]);
            Assert.Equal(expected, song.Sections.Where(SongPdfWriter.RepeatedSections(song).Contains));
        }

        [Theory]
        [MemberData(nameof(KeyChangeNoteCases))]
        public void NotesATransposedKey(string json)
        {
            var c = Case(json);
            Assert.Equal((string?)c["expected"], SongPdfWriter.KeyChangeNote((string)c["key"]!, (int)c["semitones"]!));
        }
    }
}
