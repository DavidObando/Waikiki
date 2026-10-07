package Waikiki.Core.Music

import System
import System.IO
import Waikiki.Mp4

/// The audio types Waikiki accepts for music, with the content type Yoto's uploader needs.
/// MP3, M4A, AAC, WAV, FLAC and Opus were each confirmed to transcode on Yoto; Ogg Vorbis is expected to work but untested.
class AudioFileReader {
    shared {
        private let ContentTypes []string = []string{
            ".mp3=audio/mpeg",
            ".m4a=audio/mp4",
            ".m4b=audio/mp4",
            ".aac=audio/aac",
            ".wav=audio/wav",
            ".flac=audio/flac",
            ".ogg=audio/ogg",
            ".opus=audio/ogg"
        }

        func IsSupported(path string) bool -> ContentTypeFor(path) != nil

        func ContentTypeFor(path string) string? {
            let ext = Path.GetExtension(path).ToLowerInvariant()
            for entry in ContentTypes {
                if entry.StartsWith(ext + "=") {
                    return entry.Substring(ext.Length + 1)
                }
            }
            return nil
        }

        /// Reads whatever tags the format supports; other formats yield an empty result (the file name is used).
        /// A damaged tag never prevents the file from being used.
        func Read(path string) AudioFileInfo {
            let ext = Path.GetExtension(path).ToLowerInvariant()
            try {
                if ext == ".mp3" {
                    return Id3Reader.Read(path)
                }
                if ext == ".m4a" || ext == ".m4b" {
                    let m = Mp4Reader.Read(path)
                    let info = AudioFileInfo()
                    info.Title = m.Title
                    info.Artist = m.Artist ?? m.AlbumArtist
                    info.Album = m.Album
                    info.TrackNumber = m.TrackNumber
                    info.DiscNumber = m.DiscNumber
                    info.Cover = m.Cover
                    if m.Duration > TimeSpan.Zero {
                        info.Duration = m.Duration
                    }
                    return info
                }
            } catch (e Exception) {
                // Fall through to an empty result.
            }
            return AudioFileInfo()
        }
    }
}
