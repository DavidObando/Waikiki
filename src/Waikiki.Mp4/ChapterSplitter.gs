package Waikiki.Mp4

import System
import System.Collections.Generic
import System.IO

/// Plans chapter-aligned segments and writes each as a standalone, audio-only `.m4a`
/// without re-encoding. Only AAC (`mp4a`) sources are supported.
class ChapterSplitter {
    shared {
        /// Maps every chapter to a sample range, then sub-splits ranges that exceed the limits.
        func Plan(info Mp4Info, options SplitOptions) List[TrackSegment] {
            guard let audio = info.AudioTrack else {
                throw InvalidDataException("The file has no audio track.")
            }
            guard let table = audio.Samples else {
                throw InvalidDataException("The audio track has no sample table.")
            }
            if audio.SampleEntry != "mp4a" {
                throw NotSupportedException("Only AAC (mp4a) audio can be split losslessly; found '${audio.SampleEntry}'.")
            }
            let count = table.SampleCount
            let durations = table.GetDurations()
            let sizes = table.Sizes
            // starts[i] = decode time (timescale units) at which sample i begins; starts[count] = total.
            let starts = [count + 1]uint64
            for i in 0 ... count {
                starts[i + 1] = starts[i] + uint64(durations[i])
            }
            let boundaries = List[int32]()
            let titles = List[string]()
            for c in info.Chapters {
                let tick = uint64(c.Start.TotalSeconds * float64(audio.Timescale) + 0.5)
                let s = NearestSample(starts, count, tick)
                if boundaries.Count > 0 && s <= boundaries[boundaries.Count - 1] {
                    continue
                }
                boundaries.Add(s)
                titles.Add(c.Title)
            }
            if boundaries.Count == 0 || boundaries[0] != 0 {
                boundaries.Insert(0, 0)
                titles.Insert(0, info.Title ?? "Chapter 1")
            }
            let result = List[TrackSegment]()
            for b in 0 ... boundaries.Count {
                let first = boundaries[b]
                let last = if b + 1 < boundaries.Count { boundaries[b + 1] } else { count }
                if last <= first {
                    continue
                }
                AddSplit(result, titles[b], first, last, starts, sizes, audio.Timescale, options)
            }
            return result
        }

        /// Writes one segment as a complete `.m4a`. `total` is the number of segments (for the track number tag).
        func Write(source Stream, info Mp4Info, segment TrackSegment, total int32, output Stream) {
            guard let audio = info.AudioTrack else {
                throw InvalidDataException("The file has no audio track.")
            }
            guard let table = audio.Samples else {
                throw InvalidDataException("The audio track has no sample table.")
            }
            let offsets = table.GetOffsets()
            let durations = table.GetDurations()
            let ftyp = ByteWriter.Box("ftyp", [][]uint8{
                ByteWriter.Latin1("M4A "),
                ByteWriter.U32(0),
                ByteWriter.Latin1("M4A "),
                ByteWriter.Latin1("mp42"),
                ByteWriter.Latin1("isom")
            })
            // moov size does not depend on the mdat offset, so build once with a placeholder to measure it.
            let probe = BuildMoov(info, audio, table, segment, total, 0)
            let mdatPayloadOffset = int64(ftyp.Length) + int64(probe.Length) + 8
            let moov = BuildMoov(info, audio, table, segment, total, mdatPayloadOffset)
            output.Write(ftyp, 0, ftyp.Length)
            output.Write(moov, 0, moov.Length)
            let mdatSize = segment.AudioBytes + 8
            if mdatSize > int64(uint32.MaxValue) {
                throw NotSupportedException("A single output track larger than 4 GiB is not supported.")
            }
            let header = ByteWriter.Join([][]uint8{ByteWriter.U32(uint32(mdatSize)), ByteWriter.Latin1("mdat")})
            output.Write(header, 0, header.Length)
            CopySamples(source, table, offsets, segment.StartSample, segment.EndSample, output)
        }

        private func NearestSample(starts []uint64, count int32, tick uint64) int32 {
            // First index whose start is >= tick, then pick the closer of it and its predecessor.
            var lo int32 = 0
            var hi int32 = count
            while lo < hi {
                let mid = lo + (hi - lo) / 2
                if starts[mid] < tick {
                    lo = mid + 1
                } else {
                    hi = mid
                }
            }
            if lo > 0 && lo <= count && tick - starts[lo - 1] < starts[lo] - tick {
                return lo - 1
            }
            return lo
        }

        private func AddSplit(result List[TrackSegment], title string, first int32, last int32, starts []uint64, sizes []uint32, timescale uint32, options SplitOptions) {
            var bytes int64 = 0
            for i in first ... last {
                bytes = bytes + int64(sizes[i])
            }
            let seconds = float64(starts[last] - starts[first]) / float64(timescale)
            var parts int32 = 1
            let byDuration = int32(Math.Ceiling(seconds / options.MaxDuration.TotalSeconds))
            let byBytes = int32((bytes + options.MaxBytes - 1) / options.MaxBytes)
            if byDuration > parts {
                parts = byDuration
            }
            if byBytes > parts {
                parts = byBytes
            }
            let samples = last - first
            for p in 0 ... parts {
                let s = first + int32((int64(samples) * int64(p)) / int64(parts))
                let e = first + int32((int64(samples) * int64(p + 1)) / int64(parts))
                if e <= s {
                    continue
                }
                var b int64 = 0
                for i in s ... e {
                    b = b + int64(sizes[i])
                }
                let name = if parts == 1 { title } else { "${title} (${p + 1}/${parts})" }
                result.Add(TrackSegment(
                    result.Count + 1,
                    name,
                    s,
                    e,
                    TimeSpan.FromSeconds(float64(starts[s]) / float64(timescale)),
                    TimeSpan.FromSeconds(float64(starts[e] - starts[s]) / float64(timescale)),
                    b
                ))
            }
        }

        private func CopySamples(source Stream, table SampleTable, offsets []int64, first int32, last int32, output Stream) {
            let buffer = [256 * 1024]uint8
            var i = first
            while i < last {
                // Coalesce samples that are contiguous in the source into one read.
                let runStart = offsets[i]
                var runEnd = runStart + int64(table.Sizes[i])
                var j = i + 1
                while j < last && offsets[j] == runEnd {
                    runEnd = runEnd + int64(table.Sizes[j])
                    j++
                }
                source.Position = runStart
                var remaining = runEnd - runStart
                while remaining > 0 {
                    let n = int32(Math.Min(int64(buffer.Length), remaining))
                    source.ReadExactly(buffer, 0, n)
                    output.Write(buffer, 0, n)
                    remaining = remaining - int64(n)
                }
                i = j
            }
        }

        private func BuildMoov(info Mp4Info, audio Mp4Track, table SampleTable, segment TrackSegment, total int32, mdatPayloadOffset int64) []uint8 {
            let timescale = audio.Timescale
            let durations = table.GetDurations()
            var duration uint64 = 0
            for i in segment.StartSample ... segment.EndSample {
                duration = duration + uint64(durations[i])
            }
            let sampleCount = segment.SampleCount

            // stts: run-length encode this segment's deltas.
            let runCounts = List[uint32]()
            let runDeltas = List[uint32]()
            for i in segment.StartSample ... segment.EndSample {
                let d = durations[i]
                if runDeltas.Count > 0 && runDeltas[runDeltas.Count - 1] == d {
                    runCounts[runCounts.Count - 1] = runCounts[runCounts.Count - 1] + 1
                } else {
                    runCounts.Add(1)
                    runDeltas.Add(d)
                }
            }
            let sttsParts = List[[]uint8]()
            sttsParts.Add(ByteWriter.U32(uint32(runCounts.Count)))
            for r in 0 ... runCounts.Count {
                sttsParts.Add(ByteWriter.U32(runCounts[r]))
                sttsParts.Add(ByteWriter.U32(runDeltas[r]))
            }
            let stts = ByteWriter.FullBox("stts", 0, sttsParts.ToArray())

            let stszParts = List[[]uint8]()
            stszParts.Add(ByteWriter.U32(0))
            stszParts.Add(ByteWriter.U32(uint32(sampleCount)))
            for i in segment.StartSample ... segment.EndSample {
                stszParts.Add(ByteWriter.U32(table.Sizes[i]))
            }
            let stsz = ByteWriter.FullBox("stsz", 0, stszParts.ToArray())

            // Chunks of up to ChunkSamples samples; the final chunk may hold fewer.
            let chunkSamples int32 = 1000
            let fullChunks = sampleCount / chunkSamples
            let remainder = sampleCount % chunkSamples
            let chunkCount = fullChunks + (if remainder > 0 { 1 } else { 0 })
            let stscParts = List[[]uint8]()
            var stscEntries int32 = 0
            if fullChunks > 0 {
                stscParts.Add(ByteWriter.U32(1))
                stscParts.Add(ByteWriter.U32(uint32(chunkSamples)))
                stscParts.Add(ByteWriter.U32(1))
                stscEntries++
            }
            if remainder > 0 {
                stscParts.Add(ByteWriter.U32(uint32(fullChunks + 1)))
                stscParts.Add(ByteWriter.U32(uint32(remainder)))
                stscParts.Add(ByteWriter.U32(1))
                stscEntries++
            }
            let stsc = ByteWriter.FullBox("stsc", 0, ByteWriter.Join([][]uint8{ByteWriter.U32(uint32(stscEntries))}, stscParts.ToArray()))

            // Samples are written back to back, so chunk offsets are a running sum.
            let stcoParts = List[[]uint8]()
            stcoParts.Add(ByteWriter.U32(uint32(chunkCount)))
            var running = mdatPayloadOffset
            var sample = segment.StartSample
            for c in 0 ... chunkCount {
                stcoParts.Add(ByteWriter.U32(uint32(running)))
                let inChunk = if c < fullChunks { chunkSamples } else { remainder }
                for k in 0 ... inChunk {
                    running = running + int64(table.Sizes[sample])
                    sample++
                }
            }
            let stco = ByteWriter.FullBox("stco", 0, stcoParts.ToArray())

            let stbl = ByteWriter.Box("stbl", [][]uint8{audio.SampleDescription, stts, stsc, stsz, stco})
            let dref = ByteWriter.FullBox("dref", 0, [][]uint8{
                ByteWriter.U32(1),
                ByteWriter.FullBox("url ", 1, [][]uint8{})
            })
            let minf = ByteWriter.Box("minf", [][]uint8{
                ByteWriter.FullBox("smhd", 0, [][]uint8{ByteWriter.U16(0), ByteWriter.U16(0)}),
                ByteWriter.Box("dinf", [][]uint8{dref}),
                stbl
            })
            let mdhd = ByteWriter.FullBox("mdhd", 0, [][]uint8{
                ByteWriter.U32(0),
                ByteWriter.U32(0),
                ByteWriter.U32(timescale),
                ByteWriter.U32(uint32(duration)),
                ByteWriter.U16(0x55C4),
                ByteWriter.U16(0)
            })
            let hdlr = ByteWriter.FullBox("hdlr", 0, [][]uint8{
                ByteWriter.U32(0),
                ByteWriter.Latin1("soun"),
                ByteWriter.Zeros(12),
                ByteWriter.Latin1("SoundHandler"),
                ByteWriter.U8(0)
            })
            let mdia = ByteWriter.Box("mdia", [][]uint8{mdhd, hdlr, minf})
            let identity = ByteWriter.Join([][]uint8{
                ByteWriter.U32(0x00010000), ByteWriter.U32(0), ByteWriter.U32(0),
                ByteWriter.U32(0), ByteWriter.U32(0x00010000), ByteWriter.U32(0),
                ByteWriter.U32(0), ByteWriter.U32(0), ByteWriter.U32(0x40000000)
            })
            let tkhd = ByteWriter.FullBox("tkhd", 7, [][]uint8{
                ByteWriter.U32(0),
                ByteWriter.U32(0),
                ByteWriter.U32(1),
                ByteWriter.U32(0),
                ByteWriter.U32(uint32(duration)),
                ByteWriter.Zeros(8),
                ByteWriter.U16(0),
                ByteWriter.U16(0),
                ByteWriter.U16(0x0100),
                ByteWriter.U16(0),
                identity,
                ByteWriter.U32(0),
                ByteWriter.U32(0)
            })
            let trak = ByteWriter.Box("trak", [][]uint8{tkhd, mdia})
            let mvhd = ByteWriter.FullBox("mvhd", 0, [][]uint8{
                ByteWriter.U32(0),
                ByteWriter.U32(0),
                ByteWriter.U32(timescale),
                ByteWriter.U32(uint32(duration)),
                ByteWriter.U32(0x00010000),
                ByteWriter.U16(0x0100),
                ByteWriter.U16(0),
                ByteWriter.Zeros(8),
                identity,
                ByteWriter.Zeros(24),
                ByteWriter.U32(2)
            })
            return ByteWriter.Box("moov", [][]uint8{mvhd, trak, BuildUdta(info, segment, total)})
        }

        private func BuildUdta(info Mp4Info, segment TrackSegment, total int32) []uint8 {
            let items = List[[]uint8]()
            items.Add(TextItem("©nam", segment.Title))
            // The book title is the album; the source album tag is often store marketing text.
            if let album = info.Title ?? info.Album {
                items.Add(TextItem("©alb", album))
            }
            if let artist = info.Artist {
                items.Add(TextItem("©ART", artist))
            }
            // trkn: 2 reserved bytes, track, total, 2 reserved bytes.
            let trkn = ByteWriter.Join([][]uint8{ByteWriter.U16(0), ByteWriter.U16(segment.Index), ByteWriter.U16(total), ByteWriter.U16(0)})
            items.Add(ByteWriter.Box("trkn", [][]uint8{ByteWriter.FullBox("data", 0, [][]uint8{ByteWriter.U32(0), trkn})}))
            let ilst = ByteWriter.Box("ilst", items.ToArray())
            let hdlr = ByteWriter.FullBox("hdlr", 0, [][]uint8{
                ByteWriter.U32(0),
                ByteWriter.Latin1("mdir"),
                ByteWriter.Latin1("appl"),
                ByteWriter.Zeros(8),
                ByteWriter.U8(0)
            })
            let meta = ByteWriter.FullBox("meta", 0, [][]uint8{hdlr, ilst})
            return ByteWriter.Box("udta", [][]uint8{meta})
        }

        private func TextItem(type string, text string) []uint8 {
            // data flags 1 = UTF-8 text; 4 locale bytes follow the type indicator.
            return ByteWriter.Box(type, [][]uint8{ByteWriter.FullBox("data", 1, [][]uint8{ByteWriter.U32(0), ByteWriter.Utf8(text)})})
        }
    }
}
