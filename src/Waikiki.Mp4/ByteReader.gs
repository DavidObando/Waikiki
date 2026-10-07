package Waikiki.Mp4

import System
import System.Text

/// Big-endian reads over an in-memory byte buffer. Offsets are absolute.
class ByteReader {
    shared {
        func U8(buf []uint8, p int32) uint8 -> buf[p]

        func U16(buf []uint8, p int32) uint16 {
            return uint16((uint32(buf[p]) << 8) | uint32(buf[p + 1]))
        }

        func U32(buf []uint8, p int32) uint32 {
            return (uint32(buf[p]) << 24) | (uint32(buf[p + 1]) << 16) | (uint32(buf[p + 2]) << 8) | uint32(buf[p + 3])
        }

        func U64(buf []uint8, p int32) uint64 {
            return (uint64(U32(buf, p)) << 32) | uint64(U32(buf, p + 4))
        }

        func FourCC(buf []uint8, p int32) string {
            return Encoding.Latin1.GetString(buf, p, 4)
        }
    }
}
