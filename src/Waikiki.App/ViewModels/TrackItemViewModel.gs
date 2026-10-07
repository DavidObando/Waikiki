package Waikiki.App.ViewModels

import CommunityToolkit.Mvvm.ComponentModel
import System
import Waikiki.Core

/// One row in the track list: editable title and an include checkbox over a PlannedTrack.
partial class TrackItemViewModel : ObservableObject {
    init(number int32, track PlannedTrack) {
        Number = number
        Track = track
        title = track.Title
        isIncluded = track.IsIncluded
        DurationText = Formatting.Duration(track.Segment.Duration)
        SizeText = Formatting.Size(track.Segment.AudioBytes)
    }

    prop Number int32 {
        get;
        init;
    }

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
        Track.Title = if string.IsNullOrWhiteSpace(Title) { Track.Segment.Title } else { Title.Trim() }
        Track.IsIncluded = IsIncluded
    }
}
