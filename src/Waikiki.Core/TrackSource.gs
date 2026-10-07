package Waikiki.Core

import System
import System.IO
import System.Security.Cryptography
import System.Text
import System.Threading
import System.Threading.Tasks
import Waikiki.Mp4

/// A file ready to upload. Temporary files are deleted by Cleanup.
class PreparedAudio {
    init(path string, contentType string, isTemporary bool) {
        Path = path
        ContentType = contentType
        IsTemporary = isTemporary
    }

    prop Path string {
        get;
        init;
    }

    prop ContentType string {
        get;
        init;
    }

    prop IsTemporary bool {
        get;
        init;
    }

    func Cleanup() {
        if IsTemporary && File.Exists(Path) {
            File.Delete(Path)
        }
    }
}

/// Where one track's audio comes from. Audiobook tracks are cut out of an .m4b; music tracks are the
/// user's files, uploaded untouched because Yoto transcodes them itself.
interface ITrackSource {
    /// Identifies this audio for resumable uploads, independent of the track's title.
    prop Key string {
        get;
    }

    /// Size of the audio that will be uploaded.
    prop AudioBytes int64 {
        get;
    }

    /// Known duration, or nil when it cannot be determined before Yoto transcodes the file.
    prop Duration TimeSpan? {
        get;
    }

    func PrepareAsync(tempDirectory string, cancellationToken CancellationToken) Task[PreparedAudio];
}

/// One chapter-aligned segment of an .m4b, written out as a standalone .m4a without re-encoding.
class SegmentTrackSource : ITrackSource {
    private let sourcePath string
    private let info Mp4Info
    private let segment TrackSegment
    private let totalTracks int32

    init(sourcePath string, info Mp4Info, segment TrackSegment, totalTracks int32) {
        this.sourcePath = sourcePath
        this.info = info
        this.segment = segment
        this.totalTracks = totalTracks
    }

    prop Segment TrackSegment -> segment
    prop Key string -> "${segment.StartSample}-${segment.EndSample}"
    prop AudioBytes int64 -> segment.AudioBytes
    prop Duration TimeSpan? -> segment.Duration

    func PrepareAsync(tempDirectory string, cancellationToken CancellationToken) Task[PreparedAudio] {
        return Task.Run[PreparedAudio](() -> {
            Directory.CreateDirectory(tempDirectory)
            let temp = Path.Combine(tempDirectory, "waikiki-${Guid.NewGuid():N}.m4a")
            var written = false
            try {
                using let source = FileStream(sourcePath, FileMode.Open, FileAccess.Read, FileShare.Read)
                using let output = FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None)
                ChapterSplitter.Write(source, info, segment, totalTracks, output)
                written = true
            } finally {
                if !written && File.Exists(temp) {
                    File.Delete(temp)
                }
            }
            return PreparedAudio(temp, "audio/mp4", true)
        })
    }
}

/// A music file uploaded as-is.
class FileTrackSource : ITrackSource {
    private let path string
    private let contentType string
    private let size int64
    private let key string
    private let duration TimeSpan?

    init(path string, contentType string, duration TimeSpan?) {
        this.path = path
        this.contentType = contentType
        this.duration = duration
        let f = FileInfo(path)
        size = f.Length
        // File name, size and modified time: a re-saved or replaced file uploads again; an untouched one does not.
        let text = "${f.Name}|${f.Length}|${f.LastWriteTimeUtc.Ticks}"
        key = "f:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).Substring(0, 16)
    }

    prop Path string -> path
    prop Key string -> key
    prop AudioBytes int64 -> size
    prop Duration TimeSpan? -> duration

    func PrepareAsync(tempDirectory string, cancellationToken CancellationToken) Task[PreparedAudio] {
        return Task.FromResult[PreparedAudio](PreparedAudio(path, contentType, false))
    }
}
