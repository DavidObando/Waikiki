package Waikiki.Core

import System
import System.Collections.Generic
import System.IO
import System.Security.Cryptography
import System.Text
import Waikiki.Mp4

/// One output track the user can rename or leave out.
class PlannedTrack {
    init(segment TrackSegment) {
        Segment = segment
        Title = segment.Title
    }

    prop Segment TrackSegment {
        get;
        init;
    }

    var Title string
    var IsIncluded bool = true

    /// Identifies the audio range independent of its title, so renames do not invalidate finished uploads.
    prop Key string -> "${Segment.StartSample}-${Segment.EndSample}"
}

/// An opened audiobook, ready for the user to review and upload.
class AudiobookProject {
    init(sourcePath string, info Mp4Info, tracks List[PlannedTrack]) {
        SourcePath = sourcePath
        Info = info
        Tracks = tracks
        CardTitle = info.Title ?? Path.GetFileNameWithoutExtension(sourcePath)
        Cover = info.Cover
    }

    prop SourcePath string {
        get;
        init;
    }

    prop Info Mp4Info {
        get;
        init;
    }

    prop Tracks List[PlannedTrack] {
        get;
        init;
    }

    prop Cover CoverArt? {
        get;
        set;
    }

    var CardTitle string

    /// Media ID of the icon used for every chapter.
    var IconMediaId string? = nil

    /// Identifies this source file (path, size, modified time) for resumable jobs.
    prop Fingerprint string {
        get {
            let f = FileInfo(SourcePath)
            let text = "${f.FullName}|${f.Length}|${f.LastWriteTimeUtc.Ticks}"
            return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text)))
        }
    }

    shared {
        /// Parses the file and plans one track per chapter, sub-splitting chapters that exceed Yoto's limits.
        func Open(path string, options SplitOptions) AudiobookProject {
            let info = Mp4Reader.Read(path)
            let plan = ChapterSplitter.Plan(info, options)
            let tracks = List[PlannedTrack]()
            for segment in plan {
                tracks.Add(PlannedTrack(segment))
            }
            return AudiobookProject(path, info, tracks)
        }
    }
}
