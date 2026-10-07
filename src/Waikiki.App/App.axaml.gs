package Waikiki.App

import Avalonia
import Avalonia.Controls.ApplicationLifetimes
import Avalonia.Markup.Xaml
import System
import System.Globalization
import Waikiki.App.ViewModels

partial class App : Application {
    override func Initialize() {
        AvaloniaXamlLoader.Load(this)
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
