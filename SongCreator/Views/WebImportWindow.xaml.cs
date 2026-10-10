using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Input;
using Microsoft.Web.WebView2.Core;
using SongCreator.Themes;
using SongCreator.ViewModels;

namespace SongCreator.Views
{
    /// <summary>
    /// View for <see cref="WebImportViewModel"/>: a built-in browser. The code here only drives the browser and reads
    /// the song text the user picked from the page.
    /// </summary>
    public partial class WebImportWindow : Window
    {
        private const string StartPage = "https://duckduckgo.com/";

        // The selected text, or else the page's largest <pre> block (where most chord sites put the chord sheet).
        private const string ReadSongScript = """
            (() => {
                let text = window.getSelection().toString();
                if (!text.trim()) {
                    for (const pre of document.querySelectorAll('pre')) {
                        if (pre.innerText.length > text.length) text = pre.innerText;
                    }
                }
                return { text: text, title: document.title };
            })()
            """;

        private static readonly string BrowserDataFolder = Path.Combine(App.LocalDataFolder, "WebView2");

        public WebImportWindow()
        {
            InitializeComponent();
            SourceInitialized += (_, _) => ThemeManager.ApplyTitleBar(this);
            Loaded += Window_Loaded;
        }

        private WebImportViewModel ViewModel => (WebImportViewModel)DataContext;

        private async void Window_Loaded(object sender, RoutedEventArgs e)
        {
            try
            {
                var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: BrowserDataFolder);
                await Browser.EnsureCoreWebView2Async(environment);
            }
            catch (WebView2RuntimeNotFoundException)
            {
                Browser.Visibility = Visibility.Collapsed;
                BrowserError.Visibility = Visibility.Visible;
                return;
            }

            Browser.SourceChanged += (_, _) => AddressBox.Text = Browser.Source?.ToString() ?? "";
            Browser.Source = new Uri(StartPage);
            SearchBox.Focus();
        }

        private void SearchBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter && ViewModel.SearchText.Trim().Length > 0)
                Navigate(WebImportViewModel.SearchUrl(ViewModel.SearchText));
        }

        private void AddressBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key != Key.Enter)
                return;
            string address = AddressBox.Text.Trim();
            Navigate(address.Contains("://") ? address : "https://" + address);
        }

        private void Navigate(string address)
        {
            if (Browser.CoreWebView2 != null && Uri.TryCreate(address, UriKind.Absolute, out var uri))
                Browser.Source = uri;
        }

        private void Back_Click(object sender, RoutedEventArgs e)
        {
            if (Browser.CanGoBack)
                Browser.GoBack();
        }

        private void Forward_Click(object sender, RoutedEventArgs e)
        {
            if (Browser.CanGoForward)
                Browser.GoForward();
        }

        private void Reload_Click(object sender, RoutedEventArgs e) => Browser.CoreWebView2?.Reload();

        private async void Import_Click(object sender, RoutedEventArgs e)
        {
            if (Browser.CoreWebView2 == null)
                return;
            using var result = JsonDocument.Parse(await Browser.ExecuteScriptAsync(ReadSongScript));
            string text = result.RootElement.GetProperty("text").GetString() ?? "";
            string title = result.RootElement.GetProperty("title").GetString() ?? "";
            if (ViewModel.Import(text, title))
                DialogResult = true;
        }
    }
}
