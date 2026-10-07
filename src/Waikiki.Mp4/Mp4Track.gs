package Waikiki.Mp4

import System
import System.Collections.Generic

/// A parsed `trak`: identity, media header, sample description and sample tables.
class Mp4Track {
    prop TrackId uint32 {
        get;
        set;
    }

    /// Handler type from `hdlr`, for example "soun" or "text".
    var HandlerType string = ""

    /// Media timescale (ticks per second).
    prop Timescale uint32 {
        get;
        set;
    }

    /// Media duration in timescale units.
    prop MediaDuration uint64 {
        get;
        set;
    }

    /// Four-character code of the first sample entry, for example "mp4a".
    var SampleEntry string = ""

    /// The complete `stsd` box (header included), copied verbatim into split outputs.
    prop SampleDescription []uint8 {
        get;
        set;
    }

    prop Channels int32 {
        get;
        set;
    }

    prop SampleRate int32 {
        get;
        set;
    }

    /// Track IDs referenced by a `tref/chap` box (the chapter text tracks of this track).
    var ChapterTrackIds List[uint32] = List[uint32]()

    prop Samples SampleTable? {
        get;
        set;
    }

    prop Duration TimeSpan -> if Timescale == 0 {
        TimeSpan.Zero
    } else {
        TimeSpan.FromSeconds(float64(MediaDuration) / float64(Timescale))
    }
}
