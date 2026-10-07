package Waikiki.App.ViewModels

import Avalonia.Media.Imaging
import CommunityToolkit.Mvvm.ComponentModel
import CommunityToolkit.Mvvm.Input
import System
import System.Collections.ObjectModel
import System.Diagnostics
import System.IO
import System.Net.Http
import System.Threading
import System.Threading.Tasks
import Waikiki.Core
import Waikiki.Core.Storage
import Waikiki.Mp4
import Waikiki.Yoto

partial class MainWindowViewModel : ObservableObject {
    private let appData string
    private let settingsStore AppSettingsStore
    private var settings AppSettings = AppSettings()
    private var session YotoSession? = nil
    private var project AudiobookProject? = nil
    private var cts CancellationTokenSource? = nil

    init() {
        let overrideDir = Environment.GetEnvironmentVariable("WAIKIKI_DATA_DIR")
        appData = if string.IsNullOrEmpty(overrideDir) { AppPaths.AppData() } else { overrideDir!! }
        settingsStore = AppSettingsStore(AppPaths.SettingsFile(appData))
    }

    /// A book to open as soon as the window has loaded (from the command line).
    prop StartupPath string? {
        get;
        set;
    }

    // Settings and account
    /// The custom client ID typed in Settings; empty means "use the built-in one".
    @ObservableProperty
    private var clientId string = ""

    @ObservableProperty
    private var clientSourceText string = ""

    @ObservableProperty
    private var isSettingsOpen bool

    @ObservableProperty
    private var isSignedIn bool

    @ObservableProperty
    private var storeDescription string = ""

    @ObservableProperty
    private var storeIsPlainFile bool

    // Current book
    @ObservableProperty
    private var hasProject bool

    @ObservableProperty
    private var cardTitle string = ""

    @ObservableProperty
    private var bookSummary string = ""

    @ObservableProperty
    private var coverImage Bitmap? = nil

    @ObservableProperty
    private var tracks ObservableCollection[TrackItemViewModel] = ObservableCollection[TrackItemViewModel]()

    @ObservableProperty
    private var selectedSummary string = ""

    // Work in progress
    @ObservableProperty
    private var isBusy bool

    @ObservableProperty
    private var statusText string = ""

    @ObservableProperty
    private var errorText string = ""

    @ObservableProperty
    private var progress float64

    @ObservableProperty
    private var resultUrl string = ""

    prop HasError bool -> errorText.Length > 0
    prop HasResult bool -> resultUrl.Length > 0
    prop AccountText string -> if IsSignedIn { "Signed in to Yoto" } else { "Not signed in" }
    prop CanUpload bool -> HasProject && IsSignedIn && !IsBusy
    prop CanSignIn bool -> !IsSignedIn && !IsBusy
    prop CanOpenBook bool -> !IsBusy

    /// Raises change notifications for the derived properties above.
    private func RefreshDerived() {
        OnPropertyChanged("HasError")
        OnPropertyChanged("HasResult")
        OnPropertyChanged("AccountText")
        OnPropertyChanged("CanUpload")
        OnPropertyChanged("CanSignIn")
        OnPropertyChanged("CanOpenBook")
    }

    async func InitializeAsync() {
        try {
            await InitializeCoreAsync()
        } catch (e Exception) {
            ErrorText = "Startup problem: ${e.Message}"
            RefreshDerived()
        }
    }

    private async func InitializeCoreAsync() {
        settings = await settingsStore.LoadAsync()
        let choice = await TokenStoreFactory.CreateAsync(appData, ProcessCommandRunner())
        StoreDescription = choice.Description
        StoreIsPlainFile = !choice.IsOsBacked
        session = YotoSession(choice, HttpClient())
        ClientId = settings.ClientId ?? ""
        await ConfigureSessionAsync()
        RefreshDerived()
        if let path = StartupPath {
            await OpenBookAsync(path)
        }
    }

    /// The client ID in effect: Settings override, then the environment variable, then the built-in ID.
    private func ResolveClientId() ResolvedClientId {
        return YotoClientIds.Resolve(settings.ClientId, Environment.GetEnvironmentVariable(YotoClientIds.EnvironmentVariable))
    }

    private async func ConfigureSessionAsync() {
        guard let s = session else {
            return
        }
        let resolved = ResolveClientId()
        s.Configure(resolved.ClientId)
        ClientSourceText = switch resolved.Source {
            case ClientIdSource.Settings: "a custom client ID from Settings"
            case ClientIdSource.Environment: "the ${YotoClientIds.EnvironmentVariable} environment variable"
            default: "Waikiki's built-in client ID"
        }
        try {
            IsSignedIn = await s.HasSessionAsync()
        } catch (e Exception) {
            // An unreadable store (e.g. keychain access denied) just means "not signed in".
            IsSignedIn = false
            ErrorText = "Could not read the saved Yoto session: ${e.Message}"
        }
    }

    /// Saves the optional custom client ID. A different client invalidates the saved login, so that is cleared.
    @RelayCommand
    private async func SaveClientId() {
        guard let s = session else {
            return
        }
        let before = ResolveClientId().ClientId
        let typed = ClientId.Trim()
        settings.ClientId = if typed.Length == 0 { nil } else { typed }
        await settingsStore.SaveAsync(settings)
        ErrorText = ""
        if ResolveClientId().ClientId != before {
            await s.SignOutAsync()
            IsSignedIn = false
            StatusText = "Client ID changed. Sign in to Yoto again."
        }
        await ConfigureSessionAsync()
        IsSettingsOpen = false
        RefreshDerived()
    }

    @RelayCommand
    private async func UseDefaultClientId() {
        ClientId = ""
        await SaveClientId()
    }

    @RelayCommand
    private func ToggleSettings() {
        IsSettingsOpen = !IsSettingsOpen
    }

    @RelayCommand
    private async func SignIn() {
        guard let s = session else {
            return
        }
        if !s.IsConfigured {
            IsSettingsOpen = true
            return
        }
        ErrorText = ""
        IsBusy = true
        StatusText = "Waiting for you to sign in in your browser..."
        RefreshDerived()
        cts = CancellationTokenSource(TimeSpan.FromMinutes(5.0))
        try {
            await s.SignInAsync((url string) -> { Browser.Open(url) }, cts!!.Token)
            IsSignedIn = true
            StatusText = "Signed in."
        } catch (e OperationCanceledException) {
            StatusText = "Sign-in timed out or was canceled."
            ErrorText = ClientHint
        } catch (e YotoAuthException) {
            ErrorText = if e.IsClientRejected { ClientRejectedMessage() } else { "Sign-in failed: ${e.Message}. ${ClientHint}" }
            IsSettingsOpen = e.IsClientRejected
            StatusText = ""
        } catch (e Exception) {
            ErrorText = "Sign-in failed: ${e.Message}"
            StatusText = ""
        } finally {
            IsBusy = false
            cts = nil
            RefreshDerived()
        }
    }

    @RelayCommand
    private async func SignOut() {
        guard let s = session else {
            return
        }
        await s.SignOutAsync()
        IsSignedIn = false
        StatusText = "Signed out."
        RefreshDerived()
    }

    /// Opens an audiobook file and shows its chapters and cover for review.
    async func OpenBookAsync(path string) {
        ErrorText = ""
        ResultUrl = ""
        IsBusy = true
        StatusText = "Reading ${Path.GetFileName(path)}..."
        RefreshDerived()
        try {
            let opened = await Task.Run[AudiobookProject](() -> AudiobookProject.Open(path, SplitOptions()))
            project = opened
            CardTitle = opened.CardTitle
            Tracks.Clear()
            var number = 1
            for t in opened.Tracks {
                Tracks.Add(TrackItemViewModel(number, t))
                number++
            }
            CoverImage = LoadCover(opened.Cover)
            let author = opened.Info.Artist
            BookSummary = "${if author != nil { author + " · " } else { "" }}${Formatting.Duration(opened.Info.Duration)} · ${opened.Tracks.Count} tracks" +
                if opened.Info.HasEmbeddedChapters { "" } else { " (no chapters found; split by length)" }
            HasProject = true
            UpdateSelectedSummary()
            StatusText = ""
            settings.LastFolder = Path.GetDirectoryName(path)
            await settingsStore.SaveAsync(settings)
        } catch (e Exception) {
            ErrorText = "Could not open that file: ${e.Message}"
            StatusText = ""
        } finally {
            IsBusy = false
            RefreshDerived()
        }
    }

    func UpdateSelectedSummary() {
        var count = 0
        var seconds = 0.0
        for t in Tracks {
            if t.IsIncluded {
                count++
                seconds = seconds + t.Track.Segment.Duration.TotalSeconds
            }
        }
        SelectedSummary = "${count} of ${Tracks.Count} tracks selected · ${Formatting.Duration(TimeSpan.FromSeconds(seconds))}"
    }

    @RelayCommand
    private async func Upload() {
        guard let s = session else {
            return
        }
        guard let p = project else {
            return
        }
        if !IsSignedIn {
            ErrorText = "Sign in to Yoto first."
            RefreshDerived()
            return
        }
        for t in Tracks {
            t.Commit()
        }
        p.CardTitle = if string.IsNullOrWhiteSpace(CardTitle) { p.CardTitle } else { CardTitle.Trim() }
        ErrorText = ""
        ResultUrl = ""
        Progress = 0.0
        IsBusy = true
        StatusText = "Starting..."
        RefreshDerived()
        cts = CancellationTokenSource()
        try {
            if p.IconMediaId == nil {
                try {
                    p.IconMediaId = IconCatalog.PickDefault(await s.GetPublicIconsAsync(cts!!.Token))
                } catch (e HttpRequestException) {
                    // Cards still work without an icon pick; Yoto shows its default.
                    p.IconMediaId = nil
                }
            }
            let job = UploadJob(
                s.Client,
                JobStateStore(AppPaths.JobsDirectory(appData)),
                Path.Combine(Path.GetTempPath(), "Waikiki")
            )
            let reporter = System.Progress[JobProgress]((r JobProgress) -> {
                Progress = r.Fraction
                StatusText = r.Message
            })
            let cardId = await job.RunAsync(p, reporter, cts!!.Token)
            ResultUrl = "https://my.yotoplay.com/card/${cardId}/edit"
            StatusText = "Done. Your card is on your Yoto account."
        } catch (e OperationCanceledException) {
            StatusText = "Canceled. Finished tracks are kept; press Upload to resume."
        } catch (e YotoAuthException) {
            IsSignedIn = false
            ErrorText = if e.IsClientRejected {
                ClientRejectedMessage()
            } else {
                "Your Yoto session expired. Sign in again, then press Upload to resume."
            }
            IsSettingsOpen = e.IsClientRejected
            StatusText = ""
        } catch (e YotoTranscodeException) {
            ErrorText = "Yoto could not process one of the tracks: ${e.Message}"
            StatusText = ""
        } catch (e Exception) {
            ErrorText = "Upload failed: ${e.Message}. Press Upload to resume."
            StatusText = ""
        } finally {
            IsBusy = false
            cts = nil
            RefreshDerived()
        }
    }

    @RelayCommand
    private func Cancel() {
        cts?.Cancel()
    }

    @RelayCommand
    private func OpenCard() {
        if ResultUrl.Length > 0 {
            Browser.Open(ResultUrl)
        }
    }

    prop LastFolder string? -> settings.LastFolder

    private const ClientHint string = "If the Yoto sign-in page showed an error about the app, the built-in Yoto app registration may have been revoked. You can use your own in Settings."

    private func ClientRejectedMessage() string {
        return "Yoto rejected the client ID in use (${ClientSourceText}). Waikiki's built-in registration may have been revoked or changed. " +
            "Register your own app at dashboard.yoto.dev and enter its client ID in Settings."
    }

    shared {
        private func LoadCover(cover CoverArt?) Bitmap? {
            if let c = cover {
                try {
                    return Bitmap(MemoryStream(c.Data))
                } catch (e Exception) {
                    return nil
                }
            }
            return nil
        }
    }
}
