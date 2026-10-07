package Waikiki.TestSupport

import System
import System.IO
import System.Text

/// Builds small synthetic MP3 files (ID3v2 tag plus MPEG-1 Layer III frame headers with zero payload).
/// They are not decodable audio; they only exercise tag and duration parsing.
class Mp3Fixture {
    shared {
        /// 128 kbps, 44.1 kHz, stereo: 417-byte frames of 1152 samples.
        const FrameBytes int32 = 417

        private func Join(parts [][]uint8) []uint8 {
            let ms = MemoryStream()
            for p in parts {
                ms.Write(p, 0, p.Length)
            }
            return ms.ToArray()
        }

        func Frame() []uint8 {
            let f = [FrameBytes]uint8
            f[0] = 0xFF
            f[1] = 0xFB
            f[2] = 0x90
            f[3] = 0x00
            return f
        }

        /// A first frame carrying a Xing header with the given total frame count.
        func XingFrame(totalFrames int32) []uint8 {
            let f = Frame()
            let o = 36
            let tag = Encoding.Latin1.GetBytes("Xing")
            Array.Copy(tag, 0, f, o, 4)
            f[o + 7] = 1
            f[o + 8] = uint8(totalFrames >> 24)
            f[o + 9] = uint8(totalFrames >> 16)
            f[o + 10] = uint8(totalFrames >> 8)
            f[o + 11] = uint8(totalFrames)
            return f
        }

        func Frames(count int32) []uint8 {
            let ms = MemoryStream()
            for i in 0 ... count {
                let f = Frame()
                ms.Write(f, 0, f.Length)
            }
            return ms.ToArray()
        }

        func SyncSafe(v int32) []uint8 -> []uint8{uint8((v >> 21) & 0x7F), uint8((v >> 14) & 0x7F), uint8((v >> 7) & 0x7F), uint8(v & 0x7F)}

        func Be32(v int32) []uint8 -> []uint8{uint8(v >> 24), uint8(v >> 16), uint8(v >> 8), uint8(v)}

        /// A frame: id, size (syncsafe for v2.4, plain for v2.3), two flag bytes, body.
        func TagFrame(id string, body []uint8, v24 bool) []uint8 {
            let size = if v24 { SyncSafe(body.Length) } else { Be32(body.Length) }
            return Join([][]uint8{Encoding.Latin1.GetBytes(id), size, []uint8{0, 0}, body})
        }

        /// Text frame body: encoding byte then the text. Encoding 0 = Latin-1, 1 = UTF-16 with BOM, 3 = UTF-8.
        func TextBody(text string, encoding int32) []uint8 {
            if encoding == 1 {
                return Join([][]uint8{[]uint8{1, 0xFF, 0xFE}, Encoding.Unicode.GetBytes(text)})
            }
            if encoding == 3 {
                return Join([][]uint8{[]uint8{3}, Encoding.UTF8.GetBytes(text)})
            }
            return Join([][]uint8{[]uint8{0}, Encoding.Latin1.GetBytes(text)})
        }

        func PictureBody(pictureType int32, image []uint8) []uint8 {
            return Join([][]uint8{[]uint8{0}, Encoding.Latin1.GetBytes("image/jpeg"), []uint8{0, uint8(pictureType)}, Encoding.Latin1.GetBytes("cover"), []uint8{0}, image})
        }

        func Id3(frames [][]uint8, v24 bool) []uint8 {
            let body = Join(frames)
            let padding = [16]uint8
            let total = body.Length + padding.Length
            return Join([][]uint8{
                Encoding.Latin1.GetBytes("ID3"),
                []uint8{if v24 { uint8(4) } else { uint8(3) }, 0, 0},
                SyncSafe(total),
                body,
                padding
            })
        }

        func FakeJpeg() []uint8 -> []uint8{0xFF, 0xD8, 0xFF, 0xE0, 9, 9, 9, 9}

        func FakeJpeg2() []uint8 -> []uint8{0xFF, 0xD8, 0xFF, 0xE0, 7, 7, 7, 7, 7, 7}

        /// ID3v2.3 tag (title, artist, album, track, optional disc and front cover) followed by `frames` MPEG frames.
        func Build(title string?, artist string?, album string?, track string?, frames int32) []uint8 {
            let list = System.Collections.Generic.List[[]uint8]()
            if let t = title {
                list.Add(TagFrame("TIT2", TextBody(t, 0), false))
            }
            if let a = artist {
                list.Add(TagFrame("TPE1", TextBody(a, 0), false))
            }
            if let al = album {
                list.Add(TagFrame("TALB", TextBody(al, 0), false))
            }
            if let tr = track {
                list.Add(TagFrame("TRCK", TextBody(tr, 0), false))
            }
            return Join([][]uint8{Id3(list.ToArray(), false), Frames(frames)})
        }
    }
}
