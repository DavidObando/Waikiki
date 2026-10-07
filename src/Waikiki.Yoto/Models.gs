package Waikiki.Yoto

import System
import System.Collections.Generic

/// Result of a finished upload + transcode. `Sha256` is what a card track references as `yoto:#<sha>`.
data class AudioUpload {
    init(uploadId string, sha256 string, duration TimeSpan, fileSize int64, codec string, channels string) {
        UploadId = uploadId
        Sha256 = sha256
        Duration = duration
        FileSize = fileSize
        Codec = codec
        Channels = channels
    }

    prop UploadId string {
        get;
        init;
    }

    prop Sha256 string {
        get;
        init;
    }

    /// Duration of the transcoded audio.
    prop Duration TimeSpan {
        get;
        init;
    }

    /// Size in bytes of the transcoded audio.
    prop FileSize int64 {
        get;
        init;
    }

    prop Codec string {
        get;
        init;
    }

    prop Channels string {
        get;
        init;
    }
}

data class CoverImage {
    init(mediaId string, mediaUrl string) {
        MediaId = mediaId
        MediaUrl = mediaUrl
    }

    prop MediaId string {
        get;
        init;
    }

    prop MediaUrl string {
        get;
        init;
    }
}

data class DisplayIcon {
    init(mediaId string, title string, tags List[string]) {
        MediaId = mediaId
        Title = title
        Tags = tags
    }

    prop MediaId string {
        get;
        init;
    }

    prop Title string {
        get;
        init;
    }

    prop Tags List[string] {
        get;
        init;
    }
}

/// One audio track of a card chapter.
data class CardTrack {
    init(title string, upload AudioUpload, iconMediaId string?) {
        Title = title
        Upload = upload
        IconMediaId = iconMediaId
    }

    prop Title string {
        get;
        init;
    }

    prop Upload AudioUpload {
        get;
        init;
    }

    prop IconMediaId string? {
        get;
        init;
    }
}

/// A chapter groups tracks; Waikiki uses one track per chapter.
data class CardChapter {
    init(title string, iconMediaId string?, tracks List[CardTrack]) {
        Title = title
        IconMediaId = iconMediaId
        Tracks = tracks
    }

    prop Title string {
        get;
        init;
    }

    prop IconMediaId string? {
        get;
        init;
    }

    prop Tracks List[CardTrack] {
        get;
        init;
    }
}

/// What to create or update. Set `CardId` to update an existing card.
class CardRequest {
    init(title string, chapters List[CardChapter]) {
        Title = title
        Chapters = chapters
    }

    prop Title string {
        get;
        init;
    }

    prop Chapters List[CardChapter] {
        get;
        init;
    }

    var CardId string? = nil
    var CoverUrl string? = nil
}

data class CardSummary {
    init(cardId string, title string) {
        CardId = cardId
        Title = title
    }

    prop CardId string {
        get;
        init;
    }

    prop Title string {
        get;
        init;
    }
}
