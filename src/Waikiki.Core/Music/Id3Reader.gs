package Waikiki.Core.Music

import System
import System.IO
import System.Text
import Waikiki.Mp4

/// Reads ID3v2.3/2.4 tags (title, artist, album, track and disc number, front cover) and falls back to
/// ID3v1 at the end of the file. ID3v2.2 and whole-tag unsynchronisation are not supported (skipped).
class Id3Reader {
    shared {
        func Read(path string) AudioFileInfo {
            let info = AudioFileInfo()
            using let stream = FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)
            var audioStart int64 = 0
            let header = [10]uint8
            if stream.Length >= 10 {
                stream.ReadExactly(header, 0, 10)
                if header[0] == 0x49 && header[1] == 0x44 && header[2] == 0x33 {
                    let tagSize = SyncSafe(header, 6)
                    audioStart = 10L + int64(tagSize)
                    if tagSize > 0 && tagSize < 64 * 1024 * 1024 {
                        let tag = [tagSize]uint8
                        stream.ReadExactly(tag, 0, tagSize)
                        ParseTag(header, tag, info)
                    }
                }
            }
            if info.Title == nil && info.Artist == nil && info.Album == nil {
                ReadV1(stream, info)
            }
            info.Duration = Mp3Duration.Estimate(stream, audioStart)
            return info
        }

        private func SyncSafe(buf []uint8, p int32) int32 {
            return (int32(buf[p]) << 21) | (int32(buf[p + 1]) << 14) | (int32(buf[p + 2]) << 7) | int32(buf[p + 3])
        }

        private func ParseTag(header []uint8, tag []uint8, info AudioFileInfo) {
            let major = int32(header[3])
            let flags = int32(header[5])
            if (major != 3 && major != 4) || (flags & 0x80) != 0 {
                return
            }
            var p int32 = 0
            if (flags & 0x40) != 0 && tag.Length >= 4 {
                // Extended header: skip it.
                let ext = if major == 4 { SyncSafe(tag, 0) } else { int32(ByteReader.U32(tag, 0)) + 4 }
                p = Math.Min(ext, tag.Length)
            }
            var bestCoverType int32 = -1
            while p + 10 <= tag.Length {
                if tag[p] == 0 {
                    break
                }
                let id = Encoding.Latin1.GetString(tag, p, 4)
                let size = if major == 4 { SyncSafe(tag, p + 4) } else { int32(ByteReader.U32(tag, p + 4)) }
                let start = p + 10
                if size < 0 || start + size > tag.Length {
                    break
                }
                if id == "TIT2" {
                    info.Title = Text(tag, start, size)
                } else if id == "TPE1" {
                    info.Artist = Text(tag, start, size)
                } else if id == "TALB" {
                    info.Album = Text(tag, start, size)
                } else if id == "TRCK" {
                    info.TrackNumber = LeadingNumber(Text(tag, start, size))
                } else if id == "TPOS" {
                    info.DiscNumber = LeadingNumber(Text(tag, start, size))
                } else if id == "APIC" {
                    ParsePicture(tag, start, size, info, bestCoverType)
                    if info.Cover != nil && bestCoverType < 0 {
                        bestCoverType = 0
                    }
                }
                p = start + size
            }
        }

        /// Text frame: encoding byte, then the text (first value only).
        private func Text(buf []uint8, start int32, size int32) string? {
            if size < 2 {
                return nil
            }
            let enc = buf[start]
            let value = Decode(buf, start + 1, size - 1, enc)
            let trimmed = value.Trim('\0', ' ')
            return if trimmed.Length == 0 { nil } else { trimmed }
        }

        private func Decode(buf []uint8, start int32, count int32, enc uint8) string {
            if enc == 1 || enc == 2 {
                if enc == 1 && count >= 2 && buf[start] == 0xFF && buf[start + 1] == 0xFE {
                    return Encoding.Unicode.GetString(buf, start + 2, count - 2).Split('\0')[0]
                }
                if enc == 1 && count >= 2 && buf[start] == 0xFE && buf[start + 1] == 0xFF {
                    return Encoding.BigEndianUnicode.GetString(buf, start + 2, count - 2).Split('\0')[0]
                }
                return Encoding.BigEndianUnicode.GetString(buf, start, count).Split('\0')[0]
            }
            let e = if enc == 3 { Encoding.UTF8 } else { Encoding.Latin1 }
            return e.GetString(buf, start, count).Split('\0')[0]
        }

        /// "3" or "3/12" -> 3.
        private func LeadingNumber(text string?) int32 {
            guard let t = text else {
                return 0
            }
            var n int32 = 0
            for c in t {
                if c < '0' || c > '9' {
                    break
                }
                n = n * 10 + int32(c) - int32('0')
                if n > 99999 {
                    return 0
                }
            }
            return n
        }

        /// APIC: encoding, MIME (Latin-1, null-terminated), picture type, description, image bytes.
        /// The front cover (type 3) wins; otherwise the first picture is kept.
        private func ParsePicture(buf []uint8, start int32, size int32, info AudioFileInfo, bestType int32) {
            if size < 4 {
                return
            }
            let enc = buf[start]
            var p = start + 1
            let end = start + size
            while p < end && buf[p] != 0 {
                p++
            }
            p++
            if p >= end {
                return
            }
            let pictureType = int32(buf[p])
            p++
            // Skip the description (terminated by one null, or two for UTF-16).
            if enc == 1 || enc == 2 {
                while p + 1 < end && !(buf[p] == 0 && buf[p + 1] == 0) {
                    p = p + 2
                }
                p = p + 2
            } else {
                while p < end && buf[p] != 0 {
                    p++
                }
                p++
            }
            if p >= end {
                return
            }
            if info.Cover != nil && pictureType != 3 {
                return
            }
            let data = [end - p]uint8
            Array.Copy(buf, p, data, 0, data.Length)
            info.Cover = CoverArt(CoverArt.Sniff(data), data)
        }

        private func ReadV1(stream Stream, info AudioFileInfo) {
            if stream.Length < 128 {
                return
            }
            let tag = [128]uint8
            stream.Position = stream.Length - 128
            stream.ReadExactly(tag, 0, 128)
            if tag[0] != 0x54 || tag[1] != 0x41 || tag[2] != 0x47 {
                return
            }
            let title = Encoding.Latin1.GetString(tag, 3, 30).Trim('\0', ' ')
            let artist = Encoding.Latin1.GetString(tag, 33, 30).Trim('\0', ' ')
            let album = Encoding.Latin1.GetString(tag, 63, 30).Trim('\0', ' ')
            info.Title = if title.Length == 0 { nil } else { title }
            info.Artist = if artist.Length == 0 { nil } else { artist }
            info.Album = if album.Length == 0 { nil } else { album }
            // ID3v1.1: a zero byte at 125 followed by the track number.
            if tag[125] == 0 && tag[126] != 0 {
                info.TrackNumber = int32(tag[126])
            }
        }
    }
}
