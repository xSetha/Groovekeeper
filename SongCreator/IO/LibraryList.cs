using System.IO;
using System.Text.Json;

namespace SongCreator.IO
{
    /// <summary>A named song library; <see cref="File"/> is its database, relative to the list's folder.</summary>
    public record LibraryInfo(string Id, string Name, string File);

    /// <summary>
    /// The libraries a person keeps (Personal, Band…), which one is open, and where each one's file is.
    /// Remembered in libraries.json; the library from before there were several is the first one.
    /// </summary>
    public class LibraryList
    {
        public const string DefaultName = "My library";
        public const int MaxNameLength = 60;

        private const string ListFile = "libraries.json";
        private const string DefaultFile = "library.db";
        private const string LibrariesFolder = "libraries";

        private readonly string _folder;
        private readonly List<LibraryInfo> _libraries;
        private string _currentId;

        private LibraryList(string folder, List<LibraryInfo> libraries, string currentId)
        {
            _folder = folder;
            _libraries = libraries;
            _currentId = currentId;
        }

        private record Stored(string Current, List<LibraryInfo> Libraries);

        public static string DefaultFolder { get; } = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SongCreator");

        public IReadOnlyList<LibraryInfo> Libraries => _libraries;

        /// <summary>How a removed library's file is got rid of; the Recycle Bin, so a mistake can be undone.</summary>
        public Action<string> DeleteFile { get; set; } = path =>
            Microsoft.VisualBasic.FileIO.FileSystem.DeleteFile(path,
                Microsoft.VisualBasic.FileIO.UIOption.OnlyErrorDialogs, Microsoft.VisualBasic.FileIO.RecycleOption.SendToRecycleBin);

        public LibraryInfo Current => _libraries.First(l => l.Id == _currentId);

        /// <summary>Reads the list from <paramref name="folder"/>; a missing or unreadable file gives just the first library.</summary>
        public static LibraryList Load(string folder)
        {
            try
            {
                var stored = JsonSerializer.Deserialize<Stored>(File.ReadAllText(Path.Combine(folder, ListFile)));
                if (stored?.Libraries is { Count: > 0 } libraries && libraries.All(l => IsUsable(folder, l))
                    && libraries.Select(l => l.Id).Distinct().Count() == libraries.Count)
                    return new LibraryList(folder, libraries, libraries.Any(l => l.Id == stored.Current) ? stored.Current : libraries[0].Id);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException or ArgumentException or NotSupportedException)
            {
                // Falls through to the first library.
            }
            var first = new LibraryInfo("default", DefaultName, DefaultFile);
            return new LibraryList(folder, [first], first.Id);
        }

        /// <summary>The library's database, for <see cref="SongLibrary"/>.</summary>
        public string PathOf(LibraryInfo library) => Path.Combine(_folder, library.File);

        /// <summary>Why <paramref name="name"/> can't be a library's name, or null if it can. A library keeps its own name when renamed to it.</summary>
        public string? NameProblem(string name, string? exceptId = null)
        {
            string trimmed = name.Trim();
            if (trimmed.Length == 0)
                return "Give the library a name.";
            if (trimmed.Length > MaxNameLength)
                return $"Use at most {MaxNameLength} letters.";
            if (_libraries.Any(l => l.Id != exceptId && string.Equals(l.Name, trimmed, StringComparison.OrdinalIgnoreCase)))
                return "A library with this name exists already.";
            return null;
        }

        /// <summary>Adds an empty library (its file is made when it is opened). Throws <see cref="ArgumentException"/> for a name <see cref="NameProblem"/> refuses.</summary>
        public LibraryInfo Add(string name)
        {
            if (NameProblem(name) is { } problem)
                throw new ArgumentException(problem, nameof(name));
            string id = Guid.NewGuid().ToString("N");
            var library = new LibraryInfo(id, name.Trim(), Path.Combine(LibrariesFolder, id + ".db"));
            _libraries.Add(library);
            return library;
        }

        public void Rename(string id, string name)
        {
            if (NameProblem(name, id) is { } problem)
                throw new ArgumentException(problem, nameof(name));
            int index = _libraries.FindIndex(l => l.Id == id);
            _libraries[index] = _libraries[index] with { Name = name.Trim() };
        }

        public void SetCurrent(string id)
        {
            if (_libraries.All(l => l.Id != id))
                throw new ArgumentException("No such library.", nameof(id));
            _currentId = id;
        }

        /// <summary>Takes a library out of the list (its file is left to the caller). The open library and the last one can't be removed.</summary>
        public LibraryInfo Remove(string id)
        {
            if (id == _currentId || _libraries.Count == 1)
                throw new InvalidOperationException("The open library and the last one can't be removed.");
            var library = _libraries.First(l => l.Id == id);
            _libraries.Remove(library);
            return library;
        }

        /// <summary>Sends a removed library's file away (if it was ever made).</summary>
        public void Discard(LibraryInfo library)
        {
            string path = PathOf(library);
            if (File.Exists(path))
                DeleteFile(path);
        }

        /// <summary>Writes the list. Throws <see cref="IOException"/> or <see cref="UnauthorizedAccessException"/> if it can't.</summary>
        public void Save()
        {
            Directory.CreateDirectory(_folder);
            File.WriteAllText(Path.Combine(_folder, ListFile), JsonSerializer.Serialize(new Stored(_currentId, _libraries)));
        }

        // A library file must stay inside the folder, whatever libraries.json says.
        private static bool IsUsable(string folder, LibraryInfo? library) =>
            library is { Id.Length: > 0, Name.Length: > 0, File.Length: > 0 }
            && !Path.IsPathRooted(library.File)
            && Path.GetFullPath(Path.Combine(folder, library.File)).StartsWith(Path.GetFullPath(folder) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }
}
