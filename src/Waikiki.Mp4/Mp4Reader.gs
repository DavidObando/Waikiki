package Waikiki.Mp4

import System
import System.Collections.Generic
import System.IO
import System.Text

/// Read-only MP4/M4B/M4A parser. Reads tags, cover art, chapters and the audio track layout.
/// The input stream must be seekable; only the `moov` box and chapter text samples are read.
class Mp4Reader {
    shared {
        func Read(stream Stream) Mp4Info {
            if !stream.CanSeek {
                throw ArgumentException("The stream must be seekable.", "stream")
            }
            let moov = LoadMoov(stream)
            let info = Mp4Info()
            let tracks = List[Mp4Track]()
            let top = BoxRef.Children(moov, 0, moov.Length)
            for box in top {
                if box.Type == "trak" {
                    tracks.Add(ParseTrack(moov, box))
                }
            }
            for track in tracks {
                if track.HandlerType == "soun" {
                    info.AudioTrack = track
                    break
                }
            }
            if let udta = BoxRef.Find(top, "udta") {
                let udtaChildren = BoxRef.Children(moov, udta.PayloadStart, udta.End)
                if let meta = BoxRef.Find(udtaChildren, "meta") {
                    // `meta` is a full box: skip version/flags.
                    let metaChildren = BoxRef.Children(moov, meta.PayloadStart + 4, meta.End)
                    if let ilst = BoxRef.Find(metaChildren, "ilst") {
                        ParseIlst(moov, ilst, info)
                    }
                }
                if let chpl = BoxRef.Find(udtaChildren, "chpl") {
                    ReadChpl(moov, chpl, info)
                }
            }
            if let audio = info.AudioTrack {
                if audio.ChapterTrackIds.Count > 0 {
                    ReadChapterTrack(stream, tracks, audio, info)
                }
            }
            if info.Chapters.Count > 0 {
                info.HasEmbeddedChapters = true
            } else if info.Duration > TimeSpan.Zero {
                info.Chapters.Add(Chapter(info.Title ?? "Chapter 1", TimeSpan.Zero, info.Duration))
            }
            return info
        }

        func Read(path string) Mp4Info {
            using let stream = FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)
            return Read(stream)
        }

        private func LoadMoov(stream Stream) []uint8 {
            let length = stream.Length
            var pos int64 = 0
            let header = [16]uint8
            while pos + 8 <= length {
                stream.Position = pos
                stream.ReadExactly(header, 0, 8)
                var size = int64(ByteReader.U32(header, 0))
                let type = ByteReader.FourCC(header, 4)
                var headerSize int64 = 8
                if size == 1 {
                    stream.ReadExactly(header, 8, 8)
                    size = int64(ByteReader.U64(header, 8))
                    headerSize = 16
                } else if size == 0 {
                    size = length - pos
                }
                if size < headerSize {
                    throw InvalidDataException("Malformed box '${type}' at offset ${pos}.")
                }
                if type == "moov" {
                    let payload = size - headerSize
                    if payload > int64(int32.MaxValue) {
                        throw InvalidDataException("The moov box is too large.")
                    }
                    let buf = [int32(payload)]uint8
                    stream.Position = pos + headerSize
                    stream.ReadExactly(buf, 0, buf.Length)
                    return buf
                }
                pos = pos + size
            }
            throw InvalidDataException("No moov box found; this is not a valid MP4 file.")
        }

        private func ParseTrack(buf []uint8, trak BoxRef) Mp4Track {
            let track = Mp4Track()
            let children = BoxRef.Children(buf, trak.PayloadStart, trak.End)
            if let tkhd = BoxRef.Find(children, "tkhd") {
                let version = buf[tkhd.PayloadStart]
                let idOffset int32 = if version == 1 { 20 } else { 12 }
                track.TrackId = ByteReader.U32(buf, tkhd.PayloadStart + idOffset)
            }
            if let tref = BoxRef.Find(children, "tref") {
                for r in BoxRef.Children(buf, tref.PayloadStart, tref.End) {
                    if r.Type == "chap" {
                        var p = r.PayloadStart
                        while p + 4 <= r.End {
                            track.ChapterTrackIds.Add(ByteReader.U32(buf, p))
                            p = p + 4
                        }
                    }
                }
            }
            if let mdia = BoxRef.Find(children, "mdia") {
                let mdiaChildren = BoxRef.Children(buf, mdia.PayloadStart, mdia.End)
                if let mdhd = BoxRef.Find(mdiaChildren, "mdhd") {
                    if buf[mdhd.PayloadStart] == 1 {
                        track.Timescale = ByteReader.U32(buf, mdhd.PayloadStart + 20)
                        track.MediaDuration = ByteReader.U64(buf, mdhd.PayloadStart + 24)
                    } else {
                        track.Timescale = ByteReader.U32(buf, mdhd.PayloadStart + 12)
                        track.MediaDuration = uint64(ByteReader.U32(buf, mdhd.PayloadStart + 16))
                    }
                }
                if let hdlr = BoxRef.Find(mdiaChildren, "hdlr") {
                    track.HandlerType = ByteReader.FourCC(buf, hdlr.PayloadStart + 8)
                }
                if let minf = BoxRef.Find(mdiaChildren, "minf") {
                    let minfChildren = BoxRef.Children(buf, minf.PayloadStart, minf.End)
                    if let stbl = BoxRef.Find(minfChildren, "stbl") {
                        ParseStbl(buf, stbl, track)
                    }
                }
            }
            return track
        }

        private func ParseStbl(buf []uint8, stbl BoxRef, track Mp4Track) {
            let children = BoxRef.Children(buf, stbl.PayloadStart, stbl.End)
            if let stsd = BoxRef.Find(children, "stsd") {
                // ver/flags(4) entryCount(4) then the first sample entry.
                track.SampleDescription = [stsd.End - stsd.Start]uint8
                Array.Copy(buf, stsd.Start, track.SampleDescription, 0, track.SampleDescription.Length)
                let e = stsd.PayloadStart + 8
                if e + 8 <= stsd.End {
                    track.SampleEntry = ByteReader.FourCC(buf, e + 4)
                    if track.HandlerType == "soun" && e + 36 <= stsd.End {
                        track.Channels = int32(ByteReader.U16(buf, e + 24))
                        track.SampleRate = int32(ByteReader.U32(buf, e + 32) >> 16)
                    }
                }
            }
            var sizes = []uint32{}
            if let stsz = BoxRef.Find(children, "stsz") {
                let fixedSize = ByteReader.U32(buf, stsz.PayloadStart + 4)
                let count = int32(ByteReader.U32(buf, stsz.PayloadStart + 8))
                sizes = [count]uint32
                for i in 0 ... count {
                    sizes[i] = if fixedSize != 0 { fixedSize } else { ByteReader.U32(buf, stsz.PayloadStart + 12 + i * 4) }
                }
            }
            var deltaCounts = []uint32{}
            var deltaValues = []uint32{}
            if let stts = BoxRef.Find(children, "stts") {
                let count = int32(ByteReader.U32(buf, stts.PayloadStart + 4))
                deltaCounts = [count]uint32
                deltaValues = [count]uint32
                for i in 0 ... count {
                    deltaCounts[i] = ByteReader.U32(buf, stts.PayloadStart + 8 + i * 8)
                    deltaValues[i] = ByteReader.U32(buf, stts.PayloadStart + 12 + i * 8)
                }
            }
            var chunkMap = []SampleToChunk{}
            if let stsc = BoxRef.Find(children, "stsc") {
                let count = int32(ByteReader.U32(buf, stsc.PayloadStart + 4))
                chunkMap = [count]SampleToChunk
                for i in 0 ... count {
                    let first = ByteReader.U32(buf, stsc.PayloadStart + 8 + i * 12)
                    let perChunk = ByteReader.U32(buf, stsc.PayloadStart + 12 + i * 12)
                    chunkMap[i] = SampleToChunk(first, perChunk)
                }
            }
            var chunkOffsets = []int64{}
            if let stco = BoxRef.Find(children, "stco") {
                let count = int32(ByteReader.U32(buf, stco.PayloadStart + 4))
                chunkOffsets = [count]int64
                for i in 0 ... count {
                    chunkOffsets[i] = int64(ByteReader.U32(buf, stco.PayloadStart + 8 + i * 4))
                }
            } else if let co64 = BoxRef.Find(children, "co64") {
                let count = int32(ByteReader.U32(buf, co64.PayloadStart + 4))
                chunkOffsets = [count]int64
                for i in 0 ... count {
                    chunkOffsets[i] = int64(ByteReader.U64(buf, co64.PayloadStart + 8 + i * 8))
                }
            }
            track.Samples = SampleTable(sizes, deltaCounts, deltaValues, chunkMap, chunkOffsets)
        }

        private func ParseIlst(buf []uint8, ilst BoxRef, info Mp4Info) {
            for item in BoxRef.Children(buf, ilst.PayloadStart, ilst.End) {
                var dataBox BoxRef? = nil
                for d in BoxRef.Children(buf, item.PayloadStart, item.End) {
                    if d.Type == "data" {
                        dataBox = d
                        break
                    }
                }
                guard let data = dataBox else {
                    continue
                }
                // data: version(1) flags(3) locale(4) payload
                let start = data.PayloadStart + 8
                if start > data.End {
                    continue
                }
                if item.Type == "covr" {
                    let bytes = [data.End - start]uint8
                    Array.Copy(buf, start, bytes, 0, bytes.Length)
                    info.Cover = CoverArt(CoverArt.Sniff(bytes), bytes)
                    continue
                }
                if item.Type == "trkn" || item.Type == "disk" {
                    // 2 reserved bytes, then the number (16 bits) and the total (16 bits).
                    if data.End - start >= 4 {
                        let n = int32(ByteReader.U16(buf, start + 2))
                        if item.Type == "trkn" {
                            info.TrackNumber = n
                        } else {
                            info.DiscNumber = n
                        }
                    }
                    continue
                }
                let text = Encoding.UTF8.GetString(buf, start, data.End - start)
                switch item.Type {
                    case "©nam" { info.Title = text }
                    case "©ART" { info.Artist = text }
                    case "aART" { info.AlbumArtist = text }
                    case "©alb" { info.Album = text }
                    case "©gen" { info.Genre = text }
                    case "©cmt" { info.Comment = text }
                    case "©day" { info.Year = text }
                    default {}
                }
            }
        }

        /// Nero chapter list: version(1) flags(3) [reserved(4) if version 1] count(1) then
        /// count x { start(8, 100 ns units) titleLength(1) title }.
        private func ReadChpl(buf []uint8, chpl BoxRef, info Mp4Info) {
            var p = chpl.PayloadStart
            let version = buf[p]
            p = p + 4
            if version == 1 {
                p = p + 4
            }
            if p >= chpl.End {
                return
            }
            let count = int32(buf[p])
            p++
            let starts = List[TimeSpan]()
            let titles = List[string]()
            for i in 0 ... count {
                if p + 9 > chpl.End {
                    break
                }
                let start = ByteReader.U64(buf, p)
                let len = int32(buf[p + 8])
                p = p + 9
                if p + len > chpl.End {
                    break
                }
                starts.Add(TimeSpan.FromTicks(int64(start)))
                titles.Add(Encoding.UTF8.GetString(buf, p, len))
                p = p + len
            }
            var end = info.Duration
            for i in 0 ... starts.Count {
                let chapterEnd = if i + 1 < starts.Count { starts[i + 1] } else { Later(end, starts[i]) }
                info.Chapters.Add(Chapter(titles[i], starts[i], chapterEnd))
            }
        }

        /// QuickTime chapter track: a text track referenced from the audio track by `tref/chap`.
        /// Each sample is a 16-bit length followed by the title text.
        private func ReadChapterTrack(stream Stream, tracks List[Mp4Track], audio Mp4Track, info Mp4Info) {
            var chapterTrack Mp4Track? = nil
            for t in tracks {
                if audio.ChapterTrackIds.Contains(t.TrackId) && t.Samples != nil && t.Timescale != 0 {
                    chapterTrack = t
                    break
                }
            }
            guard let ct = chapterTrack else {
                return
            }
            guard let table = ct.Samples else {
                return
            }
            let offsets = table.GetOffsets()
            let durations = table.GetDurations()
            let starts = List[TimeSpan]()
            let titles = List[string]()
            var ticks uint64 = 0
            for i in 0 ... table.SampleCount {
                let size = int32(table.Sizes[i])
                var title = ""
                if size >= 2 {
                    let sample = [size]uint8
                    stream.Position = offsets[i]
                    stream.ReadExactly(sample, 0, size)
                    title = DecodeTextSample(sample)
                }
                starts.Add(TimeSpan.FromSeconds(float64(ticks) / float64(ct.Timescale)))
                titles.Add(title)
                ticks = ticks + uint64(durations[i])
            }
            let mediaEnd = TimeSpan.FromSeconds(float64(ticks) / float64(ct.Timescale))
            let end = Later(info.Duration, mediaEnd)
            for i in 0 ... starts.Count {
                let chapterEnd = if i + 1 < starts.Count { starts[i + 1] } else { end }
                info.Chapters.Add(Chapter(titles[i], starts[i], chapterEnd))
            }
        }

        private func Later(a TimeSpan, b TimeSpan) TimeSpan -> if a > b { a } else { b }

        private func DecodeTextSample(sample []uint8) string {
            var len = int32(ByteReader.U16(sample, 0))
            if len > sample.Length - 2 {
                len = sample.Length - 2
            }
            if len >= 2 && sample[2] == 0xFE && sample[3] == 0xFF {
                return Encoding.BigEndianUnicode.GetString(sample, 4, len - 2)
            }
            return Encoding.UTF8.GetString(sample, 2, len)
        }
    }
}
