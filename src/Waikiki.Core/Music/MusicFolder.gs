package Waikiki.Core.Music

import System
import System.Collections.Generic
import System.IO
import System.Security.Cryptography
import System.Text
import Waikiki.Mp4

/// Scans a folder (one level) of music files into a playlist: tags and cover are read, tracks are ordered by
/// disc and track number when every file has one, otherwise naturally by file name.
class MusicFolder {
    shared {
        private let CoverNames []string = []string{"cover", "folder", "front", "album", "albumart"}
        private let CoverExtensions []string = []string{".jpg", ".jpeg", ".png"}

        func Open(folder string) PlaylistProject {
            let full = Path.GetFullPath(folder)
            if !Directory.Exists(full) {
                throw DirectoryNotFoundException("Folder not found: ${full}")
            }
            let entries = List[Entry]()
            for file in Directory.EnumerateFiles(full) {
                let name = Path.GetFileName(file)
                if name.StartsWith(".") || !AudioFileReader.IsSupported(file) {
                    continue
                }
                let info = AudioFileReader.Read(file)
                entries.Add(Entry(file, info))
            }
            if entries.Count == 0 {
                throw InvalidOperationException("No supported audio files (mp3, m4a, aac, wav, flac, ogg, opus) in ${full}.")
            }
            Sort(entries)

            let tracks = List[PlannedTrack]()
            for e in entries {
                let source = FileTrackSource(e.Path, AudioFileReader.ContentTypeFor(e.Path)!!, e.Info.Duration)
                tracks.Add(PlannedTrack(source, TitleFor(e)))
            }
            let fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(full)))
            let project = PlaylistProject(PlaylistKind.Music, full, fingerprint, tracks)
            project.CardTitle = CommonValue(entries, (i AudioFileInfo) -> i.Album) ?? Path.GetFileName(full.TrimEnd(Path.DirectorySeparatorChar))
            project.Artist = ArtistSummary(entries)
            project.Cover = FindCover(full, entries)
            return project
        }

        private func TitleFor(e Entry) string {
            if let t = e.Info.Title {
                return t
            }
            let name = Path.GetFileNameWithoutExtension(e.Path)
            return StripTrackPrefix(name)
        }

        /// "01 - Song", "01. Song", "01_Song", "1 Song" -> "Song"; leaves names that are only digits alone.
        func StripTrackPrefix(name string) string {
            var i = 0
            while i < name.Length && Char.IsDigit(name[i]) {
                i++
            }
            if i == 0 || i >= name.Length {
                return name
            }
            var j = i
            while j < name.Length && (name[j] == ' ' || name[j] == '-' || name[j] == '.' || name[j] == '_') {
                j++
            }
            if j == i || j >= name.Length {
                return name
            }
            return name.Substring(j)
        }

        /// The number in a leading "01 - ..." file name prefix, or 0.
        private func PrefixNumber(name string) int32 {
            var n int32 = 0
            var i = 0
            while i < name.Length && Char.IsDigit(name[i]) && i < 5 {
                n = n * 10 + int32(name[i]) - int32('0')
                i++
            }
            return if i > 0 && i < name.Length && !Char.IsDigit(name[i]) { n } else { 0 }
        }

        private func Sort(entries List[Entry]) {
            var allNumbered = true
            for e in entries {
                if e.Info.TrackNumber <= 0 {
                    allNumbered = false
                }
            }
            let natural = NaturalComparer()
            if allNumbered {
                entries.Sort((a Entry, b Entry) -> {
                    let disc = a.Info.DiscNumber.CompareTo(b.Info.DiscNumber)
                    if disc != 0 {
                        return disc
                    }
                    let track = a.Info.TrackNumber.CompareTo(b.Info.TrackNumber)
                    if track != 0 {
                        return track
                    }
                    return natural.Compare(Path.GetFileName(a.Path), Path.GetFileName(b.Path))
                })
            } else {
                entries.Sort((a Entry, b Entry) -> natural.Compare(Path.GetFileName(a.Path), Path.GetFileName(b.Path)))
            }
        }

        /// The value all entries share, or nil if they differ or are missing.
        private func CommonValue(entries List[Entry], pick (AudioFileInfo) -> string?) string? {
            var common string? = nil
            for e in entries {
                let v = pick(e.Info)
                if string.IsNullOrWhiteSpace(v) {
                    return nil
                }
                if common == nil {
                    common = v
                } else if !string.Equals(common, v, StringComparison.OrdinalIgnoreCase) {
                    return nil
                }
            }
            return common
        }

        private func ArtistSummary(entries List[Entry]) string? {
            let one = CommonValue(entries, (i AudioFileInfo) -> i.Artist)
            if one != nil {
                return one
            }
            for e in entries {
                if !string.IsNullOrWhiteSpace(e.Info.Artist) {
                    return "Various artists"
                }
            }
            return nil
        }

        /// Embedded art from the first track that has it, else cover.jpg / folder.jpg / front.jpg (or .png) in the folder.
        private func FindCover(folder string, entries List[Entry]) CoverArt? {
            for e in entries {
                if let c = e.Info.Cover {
                    return c
                }
            }
            for name in CoverNames {
                for ext in CoverExtensions {
                    for file in Directory.EnumerateFiles(folder) {
                        if string.Equals(Path.GetFileName(file), name + ext, StringComparison.OrdinalIgnoreCase) {
                            return CoverFile.Load(file)
                        }
                    }
                }
            }
            return nil
        }
    }
}

class Entry {
    init(path string, info AudioFileInfo) {
        Path = path
        Info = info
    }

    prop Path string {
        get;
        init;
    }

    prop Info AudioFileInfo {
        get;
        init;
    }
}

/// Loads an image file as cover art.
class CoverFile {
    shared {
        func Load(path string) CoverArt {
            let data = File.ReadAllBytes(path)
            return CoverArt(CoverArt.Sniff(data), data)
        }
    }
}
