using System.Globalization;
using System.Windows.Data;
using SongCreator.Music;

namespace SongCreator.Converters
{
    /// <summary>A chord or key (first value) written in the chosen <see cref="NoteNaming"/> (second value).</summary>
    public class NoteNameConverter : IMultiValueConverter
    {
        public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture) =>
            values is [string name, NoteNaming naming] ? NoteNames.Display(name, naming) : values.FirstOrDefault() as string ?? "";

        public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture) =>
            throw new NotSupportedException();
    }
}
