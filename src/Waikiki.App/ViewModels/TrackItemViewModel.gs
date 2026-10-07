package Waikiki.App.ViewModels

import CommunityToolkit.Mvvm.ComponentModel
import System
import Waikiki.Core

/// One row in the track list: editable title and an include checkbox over a PlannedTrack.
partial class TrackItemViewModel : ObservableObject {
    init(number int32, track PlannedTrack, canReorder bool) {
        this.number = number
        Track = track
        CanReorder = canReorder
        title = track.Title
        isIncluded = track.IncludedByDefault()
        DurationText = if let d = track.Duration { Formatting.Duration(d) } else { "—" }
        SizeText = Formatting.Size(track.AudioBytes)
    }

    /// Music tracks can be moved up and down; audiobook chapters keep their order.
    prop CanReorder bool {
        get;
        init;
    }

    @ObservableProperty
    private var number int32

    prop Track PlannedTrack {
        get;
        init;
    }

    prop DurationText string {
        get;
        init;
    }

    prop SizeText string {
        get;
        init;
    }

    @ObservableProperty
    private var title string

    @ObservableProperty
    private var isIncluded bool

    /// Copies the edited values back to the underlying track before a job runs.
    func Commit() {
        Track.Title = if string.IsNullOrWhiteSpace(Title) { Track.OriginalTitle } else { Title.Trim() }
        Track.IsIncluded = IsIncluded
    }
}
