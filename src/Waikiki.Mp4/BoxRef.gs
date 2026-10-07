package Waikiki.Mp4

import System
import System.Collections.Generic

/// A box located inside an in-memory buffer. Payload excludes the box header.
data class BoxRef {
    init(type string, start int32, payloadStart int32, end int32) {
        Type = type
        Start = start
        PayloadStart = payloadStart
        End = end
    }

    prop Type string {
        get;
        init;
    }

    /// Offset of the box header.
    prop Start int32 {
        get;
        init;
    }

    prop PayloadStart int32 {
        get;
        init;
    }

    prop End int32 {
        get;
        init;
    }

    shared {
        /// Lists the child boxes found in buf[start..end). Stops at the first malformed header.
        func Children(buf []uint8, start int32, end int32) List[BoxRef] {
            let result = List[BoxRef]()
            var p = start
            while p + 8 <= end {
                var size = int64(ByteReader.U32(buf, p))
                let type = ByteReader.FourCC(buf, p + 4)
                var header int32 = 8
                if size == 1 {
                    if p + 16 > end {
                        break
                    }
                    size = int64(ByteReader.U64(buf, p + 8))
                    header = 16
                } else if size == 0 {
                    size = int64(end - p)
                }
                if size < int64(header) || int64(p) + size > int64(end) {
                    break
                }
                result.Add(BoxRef(type, p, p + header, p + int32(size)))
                p = p + int32(size)
            }
            return result
        }

        func Find(boxes List[BoxRef], type string) BoxRef? {
            for b in boxes {
                if b.Type == type {
                    return b
                }
            }
            return nil
        }
    }
}
