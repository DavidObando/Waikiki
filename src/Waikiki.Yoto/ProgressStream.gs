package Waikiki.Yoto

import System
import System.IO

/// Wraps a readable stream and reports the cumulative number of bytes read.
class ProgressStream : Stream {
    private let inner Stream
    private let progress IProgress[int64]?
    private var total int64 = 0

    init(inner Stream, progress IProgress[int64]?) {
        this.inner = inner
        this.progress = progress
    }

    override prop CanRead bool -> true
    override prop CanSeek bool -> inner.CanSeek
    override prop CanWrite bool -> false
    override prop Length int64 -> inner.Length

    override prop Position int64 {
        get -> inner.Position
        set -> inner.Position = value
    }

    override func Flush() {
    }

    override func Read(buffer []uint8, offset int32, count int32) int32 {
        let n = inner.Read(buffer, offset, count)
        if n > 0 {
            total = total + int64(n)
            if let p = progress {
                p.Report(total)
            }
        }
        return n
    }

    override func Seek(offset int64, origin SeekOrigin) int64 {
        return inner.Seek(offset, origin)
    }

    override func SetLength(value int64) {
        throw NotSupportedException()
    }

    override func Write(buffer []uint8, offset int32, count int32) {
        throw NotSupportedException()
    }

    protected override func Dispose(disposing bool) {
        if disposing {
            inner.Dispose()
        }
        base.Dispose(disposing)
    }
}
