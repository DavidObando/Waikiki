package Waikiki.Mp4

import System
import System.Collections.Generic

/// What Waikiki needs to know about an .m4b/.m4a file: tags, cover, chapters and the audio track.
class Mp4Info {
    prop Title string? {
        get;
        set;
    }

    prop Artist string? {
        get;
        set;
    }

    prop AlbumArtist string? {
        get;
        set;
    }

    prop Album string? {
        get;
        set;
    }

    prop Genre string? {
        get;
        set;
    }

    prop Comment string? {
        get;
        set;
    }

    prop Year string? {
        get;
        set;
    }

    prop Cover CoverArt? {
        get;
        set;
    }

    var Chapters List[Chapter] = List[Chapter]()

    /// True when Chapters came from a chapter track or chapter list rather than being synthesized.
    prop HasEmbeddedChapters bool {
        get;
        set;
    }

    prop AudioTrack Mp4Track? {
        get;
        set;
    }

    prop Duration TimeSpan -> if let t = AudioTrack {
        t.Duration
    } else {
        TimeSpan.Zero
    }
}
