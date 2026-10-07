package Waikiki.Mp4

import System
import System.Collections.Generic

/// One `stsc` entry: chunks starting at FirstChunk (1-based) hold SamplesPerChunk samples each.
data class SampleToChunk {
    init(firstChunk uint32, samplesPerChunk uint32) {
        FirstChunk = firstChunk
        SamplesPerChunk = samplesPerChunk
    }

    prop FirstChunk uint32 {
        get;
        init;
    }

    prop SamplesPerChunk uint32 {
        get;
        init;
    }
}

/// The per-track sample tables (stts/stsz/stsc/stco) needed to locate samples in the file.
class SampleTable {
    init(sizes []uint32, deltaCounts []uint32, deltaValues []uint32, chunkMap []SampleToChunk, chunkOffsets []int64) {
        Sizes = sizes
        DeltaCounts = deltaCounts
        DeltaValues = deltaValues
        ChunkMap = chunkMap
        ChunkOffsets = chunkOffsets
    }

    /// Size in bytes of every sample.
    prop Sizes []uint32 {
        get;
        init;
    }

    /// Run-length encoded decode deltas (stts): DeltaCounts[i] samples last DeltaValues[i] timescale units each.
    prop DeltaCounts []uint32 {
        get;
        init;
    }

    prop DeltaValues []uint32 {
        get;
        init;
    }

    prop ChunkMap []SampleToChunk {
        get;
        init;
    }

    /// Absolute file offset of every chunk.
    prop ChunkOffsets []int64 {
        get;
        init;
    }

    prop SampleCount int32 -> Sizes.Length

    private var offsetCache []?int64 = nil
    private var durationCache []?uint32 = nil

    /// Decode duration of every sample in timescale units.
    func GetDurations() []uint32 {
        if let cached = durationCache {
            return cached
        }
        let result = [SampleCount]uint32
        var n int32 = 0
        for i in 0 ... DeltaCounts.Length {
            var k uint32 = 0
            while k < DeltaCounts[i] && n < result.Length {
                result[n] = DeltaValues[i]
                n++
                k++
            }
        }
        durationCache = result
        return result
    }

    /// Absolute file offset of every sample.
    func GetOffsets() []int64 {
        if let cached = offsetCache {
            return cached
        }
        let result = [SampleCount]int64
        var sample int32 = 0
        for c in 0 ... ChunkOffsets.Length {
            let chunkNumber = uint32(c + 1)
            var perChunk uint32 = 0
            for e in ChunkMap {
                if e.FirstChunk <= chunkNumber {
                    perChunk = e.SamplesPerChunk
                }
            }
            var offset = ChunkOffsets[c]
            var k uint32 = 0
            while k < perChunk && sample < result.Length {
                result[sample] = offset
                offset = offset + int64(Sizes[sample])
                sample++
                k++
            }
        }
        offsetCache = result
        return result
    }
}
