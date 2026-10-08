package Waikiki.App

import Avalonia
import Avalonia.Controls
import Avalonia.Controls.ApplicationLifetimes
import Avalonia.Layout
import Avalonia.Media
import Avalonia.Markup.Xaml
import System
import System.Globalization
import System.Reflection
import Waikiki.App.ViewModels

partial class App : Application {
    override func Initialize() {
        AvaloniaXamlLoader.Load(this)
    }

    /// The app version from the assembly (for example "0.1.14"), without the git hash Nerdbank.GitVersioning appends.
    shared {
        func VersionText() string {
            let assembly = Assembly.GetEntryAssembly() ?? typeof(App).Assembly
            let attribute = assembly.GetCustomAttribute[AssemblyInformationalVersionAttribute]()
            let text = attribute?.InformationalVersion ?? assembly.GetName().Version?.ToString() ?? "unknown"
            let plus = text.IndexOf('+')
            return if plus > 0 { text.Substring(0, plus) } else { text }
        }
    }

    func OnAboutClick(sender object?, e EventArgs) {
        let panel = StackPanel{Spacing: 8, Margin: Thickness(24), HorizontalAlignment: HorizontalAlignment.Center}
        panel.Children.Add(TextBlock{Text: "Waikiki", FontSize: 24, FontWeight: FontWeight.Bold, HorizontalAlignment: HorizontalAlignment.Center})
        panel.Children.Add(TextBlock{Text: "Turn audiobooks and music into Yoto cards", HorizontalAlignment: HorizontalAlignment.Center})
        panel.Children.Add(TextBlock{Text: "Version ${VersionText()}", HorizontalAlignment: HorizontalAlignment.Center})
        panel.Children.Add(TextBlock{Text: "Copyright © 2026 David Obando", HorizontalAlignment: HorizontalAlignment.Center})
        panel.Children.Add(TextBlock{Text: "Not affiliated with Yoto.", FontSize: 12, HorizontalAlignment: HorizontalAlignment.Center})
        let about = Window{
            Title: "About Waikiki",
            Content: panel,
            Width: 340,
            SizeToContent: SizeToContent.Height,
            CanResize: false,
            WindowStartupLocation: WindowStartupLocation.CenterScreen
        }
        about.Show()
    }

    override func OnFrameworkInitializationCompleted() {
        if ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop {
            CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture
            let viewModel = MainWindowViewModel()
            desktop.MainWindow = MainWindow(viewModel)
            // A book path on the command line opens it straight away.
            if desktop.Args != nil && desktop.Args!!.Length > 0 && !desktop.Args!![0].StartsWith("--") {
                viewModel.StartupPath = desktop.Args!![0]
            }
        }
        base.OnFrameworkInitializationCompleted()
    }
}
