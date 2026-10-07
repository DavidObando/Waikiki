package Waikiki.Mp4

import System
import System.IO
import System.Text

/// Big-endian builders for MP4 boxes.
class ByteWriter {
    shared {
        func Join(parts [][]uint8) []uint8 {
            let ms = MemoryStream()
            for p in parts {
                ms.Write(p, 0, p.Length)
            }
            return ms.ToArray()
        }

        func U8(v int32) []uint8 -> []uint8{uint8(v)}

        func U16(v int32) []uint8 -> []uint8{uint8(v >> 8), uint8(v)}

        func U32(v uint32) []uint8 -> []uint8{uint8(v >> 24), uint8(v >> 16), uint8(v >> 8), uint8(v)}

        func U64(v uint64) []uint8 -> Join([][]uint8{U32(uint32(v >> 32)), U32(uint32(v))})

        func Zeros(n int32) []uint8 -> [n]uint8

        func Latin1(s string) []uint8 -> Encoding.Latin1.GetBytes(s)

        func Utf8(s string) []uint8 -> Encoding.UTF8.GetBytes(s)

        func Box(type string, parts [][]uint8) []uint8 {
            let body = Join(parts)
            return Join([][]uint8{U32(uint32(body.Length + 8)), Latin1(type), body})
        }

        /// A full box: version/flags followed by the parts.
        func FullBox(type string, versionAndFlags uint32, parts [][]uint8) []uint8 {
            let all = [][]uint8{U32(versionAndFlags)}
            return Box(type, Join(all, parts))
        }

        func Join(first [][]uint8, rest [][]uint8) [][]uint8 {
            let result = [first.Length + rest.Length][]uint8
            for i in 0 ... first.Length {
                result[i] = first[i]
            }
            for i in 0 ... rest.Length {
                result[first.Length + i] = rest[i]
            }
            return result
        }
    }
}
