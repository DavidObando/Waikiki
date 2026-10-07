package Waikiki.App

import Avalonia.Controls
import Avalonia.Interactivity
import Avalonia.Platform.Storage
import System
import Waikiki.App.ViewModels

partial class MainWindow : Window {
    private let viewModel MainWindowViewModel?

    init() {
        InitializeComponent()
    }

    init(viewModel MainWindowViewModel) {
        InitializeComponent()
        this.viewModel = viewModel
        DataContext = viewModel
    }

    protected override async func OnOpened(e EventArgs) void {
        base.OnOpened(e)
        if let vm = viewModel {
            await vm.InitializeAsync()
        }
    }

    private async func OnChooseFile(sender object, e RoutedEventArgs) void {
        guard let vm = viewModel else {
            return
        }
        let audiobooks = FilePickerFileType("Audiobooks")
        audiobooks.Patterns = []string{"*.m4b", "*.m4a"}
        let options = FilePickerOpenOptions()
        options.Title = "Choose an audiobook"
        options.AllowMultiple = false
        options.FileTypeFilter = []FilePickerFileType{audiobooks}
        if let folder = vm.LastFolder {
            options.SuggestedStartLocation = await StorageProvider.TryGetFolderFromPathAsync(folder)
        }
        let files = await StorageProvider.OpenFilePickerAsync(options)
        if files.Count > 0 {
            if let path = files[0].TryGetLocalPath() {
                await vm.OpenBookAsync(path)
            }
        }
    }
}
