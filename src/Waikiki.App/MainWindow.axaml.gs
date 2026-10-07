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

    private async func OnChooseFolder(sender object, e RoutedEventArgs) void {
        guard let vm = viewModel else {
            return
        }
        let options = FolderPickerOpenOptions()
        options.Title = "Choose a folder of music files"
        options.AllowMultiple = false
        if let folder = vm.LastFolder {
            options.SuggestedStartLocation = await StorageProvider.TryGetFolderFromPathAsync(folder)
        }
        let folders = await StorageProvider.OpenFolderPickerAsync(options)
        if folders.Count > 0 {
            if let path = folders[0].TryGetLocalPath() {
                await vm.OpenMusicFolderAsync(path)
            }
        }
    }

    private async func OnChooseCover(sender object, e RoutedEventArgs) void {
        guard let vm = viewModel else {
            return
        }
        let images = FilePickerFileType("Images")
        images.Patterns = []string{"*.jpg", "*.jpeg", "*.png"}
        let options = FilePickerOpenOptions()
        options.Title = "Choose a cover image"
        options.AllowMultiple = false
        options.FileTypeFilter = []FilePickerFileType{images}
        let files = await StorageProvider.OpenFilePickerAsync(options)
        if files.Count > 0 {
            if let path = files[0].TryGetLocalPath() {
                vm.SetCoverFromFile(path)
            }
        }
    }

    private func OnIncludeChanged(sender object, e RoutedEventArgs) {
        if let vm = viewModel {
            vm.UpdateSelectedSummary()
        }
    }

    private func OnMoveUp(sender object, e RoutedEventArgs) {
        Move(sender, -1)
    }

    private func OnMoveDown(sender object, e RoutedEventArgs) {
        Move(sender, 1)
    }

    private func Move(sender object, delta int32) {
        if let vm = viewModel {
            if let button = sender as Button {
                if let item = button.DataContext as TrackItemViewModel {
                    vm.MoveTrack(item, delta)
                }
            }
        }
    }
}
