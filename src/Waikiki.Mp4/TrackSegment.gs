package Waikiki.Mp4

import System

/// A contiguous run of audio samples that becomes one output track.
data class TrackSegment {
    init(index int32, title string, startSample int32, endSample int32, start TimeSpan, duration TimeSpan, audioBytes int64) {
        Index = index
        Title = title
        StartSample = startSample
        EndSample = endSample
        Start = start
        Duration = duration
        AudioBytes = audioBytes
    }

    /// 1-based position in the output sequence.
    prop Index int32 {
        get;
        init;
    }

    prop Title string {
        get;
        init;
    }

    /// First sample (inclusive).
    prop StartSample int32 {
        get;
        init;
    }

    /// Last sample (exclusive).
    prop EndSample int32 {
        get;
        init;
    }

    /// Offset of the first sample from the beginning of the source audio.
    prop Start TimeSpan {
        get;
        init;
    }

    prop Duration TimeSpan {
        get;
        init;
    }

    /// Total size of the sample data (excludes container overhead).
    prop AudioBytes int64 {
        get;
        init;
    }

    prop SampleCount int32 -> EndSample - StartSample
}
