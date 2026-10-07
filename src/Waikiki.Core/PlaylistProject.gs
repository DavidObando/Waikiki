package Waikiki.Core

import System
import System.Collections.Generic
import System.IO
import System.Security.Cryptography
import System.Text
import Waikiki.Core.Music
import Waikiki.Mp4

enum PlaylistKind {
    Audiobook,
    Music
}

/// One output track the user can rename, reorder (music) or leave out.
class PlannedTrack {
    init(source ITrackSource, title string) {
        Source = source
        OriginalTitle = title
        Title = title
    }

    prop Source ITrackSource {
        get;
        init;
    }

    /// The title found in the file or chapter, used if the user clears the edited one.
    prop OriginalTitle string {
        get;
        init;
    }

    var Title string
    var IsIncluded bool = true

    prop Key string -> Source.Key
    prop AudioBytes int64 -> Source.AudioBytes

    func IncludedByDefault() bool -> IsIncluded
    prop Duration TimeSpan? -> Source.Duration
}

/// Yoto's per-card limits (from consumer guidance; not documented as API limits).
class YotoLimits {
    shared {
        const MaxTracksPerCard int32 = 100
        const MaxTrackBytes int64 = 100L * 1024L * 1024L
    }
}

/// An opened audiobook or music folder, ready for the user to review and upload.
class PlaylistProject {
    init(kind PlaylistKind, sourcePath string, fingerprint string, tracks List[PlannedTrack]) {
        Kind = kind
        SourcePath = sourcePath
        Fingerprint = fingerprint
        Tracks = tracks
        CardTitle = Path.GetFileNameWithoutExtension(sourcePath)
    }

    prop Kind PlaylistKind {
        get;
        init;
    }

    prop SourcePath string {
        get;
        init;
    }

    /// Identifies this source for resumable jobs. Audiobooks use path, size and modified time, so a changed
    /// file starts over. Music folders use the folder path only, so adding a song and running again updates
    /// the same card instead of creating a new one (per-file keys already skip finished uploads).
    prop Fingerprint string {
        get;
        init;
    }

    prop Tracks List[PlannedTrack] {
        get;
        init;
    }

    /// Chosen cover image, from the files, a cover file in the folder, or the user.
    prop Cover CoverArt? {
        get;
        set;
    }

    var CardTitle string
    var Artist string? = nil

    /// The .m4b's parsed metadata (audiobooks only).
    var AudiobookInfo Mp4Info? = nil

    /// Media ID of the icon used for every chapter.
    var IconMediaId string? = nil

    prop IsAudiobook bool -> Kind == PlaylistKind.Audiobook

    /// Tags to look for when picking the default Yoto icon.
    prop IconTags []string -> if IsAudiobook {
        []string{"book", "story", "audiobook", "reading"}
    } else {
        []string{"music", "note", "song", "headphones"}
    }

    /// Total duration when every included track's duration is known.
    prop KnownDuration TimeSpan? {
        get {
            var total = TimeSpan.Zero
            for t in Tracks {
                if !t.IsIncluded {
                    continue
                }
                if let d = t.Duration {
                    total = total + d
                } else {
                    return nil
                }
            }
            return total
        }
    }

    /// Reasons the current selection cannot be uploaded as is (empty when it can).
    func Problems() List[string] {
        let problems = List[string]()
        var count = 0
        for t in Tracks {
            if !t.IsIncluded {
                continue
            }
            count++
            if t.AudioBytes > YotoLimits.MaxTrackBytes {
                problems.Add("\"${t.Title}\" is larger than Yoto's per-track limit of ${YotoLimits.MaxTrackBytes / (1024L * 1024L)} MB.")
            }
        }
        if count == 0 {
            problems.Add("Select at least one track.")
        }
        if count > YotoLimits.MaxTracksPerCard {
            problems.Add("A card holds at most ${YotoLimits.MaxTracksPerCard} tracks; ${count} are selected.")
        }
        return problems
    }

    shared {
        /// Scans a folder of music files into a playlist, one track per file.
        func OpenMusicFolder(path string) PlaylistProject -> MusicFolder.Open(path)

        /// Parses an .m4b and plans one track per chapter, sub-splitting chapters that exceed Yoto's limits.
        func OpenAudiobook(path string, options SplitOptions) PlaylistProject {
            let info = Mp4Reader.Read(path)
            let plan = ChapterSplitter.Plan(info, options)
            let tracks = List[PlannedTrack]()
            for segment in plan {
                tracks.Add(PlannedTrack(SegmentTrackSource(path, info, segment, plan.Count), segment.Title))
            }
            let f = FileInfo(path)
            let text = "${f.FullName}|${f.Length}|${f.LastWriteTimeUtc.Ticks}"
            let project = PlaylistProject(PlaylistKind.Audiobook, path, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))), tracks)
            project.AudiobookInfo = info
            project.CardTitle = info.Title ?? Path.GetFileNameWithoutExtension(path)
            project.Artist = info.Artist
            project.Cover = info.Cover
            return project
        }
    }
}
