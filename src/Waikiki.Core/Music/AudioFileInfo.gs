package Waikiki.Core.Music

import System
import Waikiki.Mp4

/// What Waikiki learns about one music file before uploading it. Anything not found is nil or 0.
class AudioFileInfo {
    var Title string? = nil
    var Artist string? = nil
    var Album string? = nil
    var TrackNumber int32
    var DiscNumber int32
    var Duration TimeSpan? = nil
    var Cover CoverArt? = nil
}
