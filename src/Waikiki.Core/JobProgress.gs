package Waikiki.Core

import System

data class JobProgress {
    init(message string, fraction float64, trackNumber int32, trackCount int32) {
        Message = message
        Fraction = fraction
        TrackNumber = trackNumber
        TrackCount = trackCount
    }

    prop Message string {
        get;
        init;
    }

    /// Overall progress from 0 to 1, weighted by audio size.
    prop Fraction float64 {
        get;
        init;
    }

    /// 1-based index of the track being processed (0 outside the track phase).
    prop TrackNumber int32 {
        get;
        init;
    }

    prop TrackCount int32 {
        get;
        init;
    }
}
