package Waikiki.Mp4.Tests

import System
import System.Collections.Generic
import System.IO
import System.Text

enum ChapterStyle {
    None,
    QuickTimeTrack,
    Nero
}

/// Builds small, synthetic, non-copyrighted MP4 files in memory for parser tests.
class Mp4Fixture {
    shared {
        let AudioSamples int32 = 200
        let SampleSize int32 = 10
        let SamplesPerChunk int32 = 25
        let AudioTimescale int32 = 44100
        let SampleDelta int32 = 1024

        func Join(parts [][]uint8) []uint8 {
            let ms = MemoryStream()
            for p in parts {
                ms.Write(p, 0, p.Length)
            }
            return ms.ToArray()
        }

        func Concat(a []uint8, b []uint8) []uint8 -> Join([][]uint8{a, b})

        func Concat(a []uint8, b []uint8, c []uint8) []uint8 -> Join([][]uint8{a, b, c})

        func Concat(a []uint8, b []uint8, c []uint8, d []uint8) []uint8 -> Join([][]uint8{a, b, c, d})

        func Concat(a []uint8, b []uint8, c []uint8, d []uint8, e []uint8) []uint8 -> Join([][]uint8{a, b, c, d, e})

        func Concat(a []uint8, b []uint8, c []uint8, d []uint8, e []uint8, f []uint8) []uint8 -> Join([][]uint8{a, b, c, d, e, f})

        func Concat(a []uint8, b []uint8, c []uint8, d []uint8, e []uint8, f []uint8, g []uint8, h []uint8, i []uint8) []uint8 -> Join([][]uint8{a, b, c, d, e, f, g, h, i})

        func U16(v int32) []uint8 -> []uint8{uint8(v >> 8), uint8(v)}

        func U32(v uint32) []uint8 -> []uint8{uint8(v >> 24), uint8(v >> 16), uint8(v >> 8), uint8(v)}

        func U64(v uint64) []uint8 -> Concat(U32(uint32(v >> 32)), U32(uint32(v)))

        func Zeros(n int32) []uint8 -> [n]uint8

        func Latin1(s string) []uint8 -> Encoding.Latin1.GetBytes(s)

        func Box(type string, body []uint8) []uint8 {
            return Concat(U32(uint32(body.Length + 8)), Latin1(type), body)
        }

        func Box(type string, a []uint8, b []uint8) []uint8 -> Box(type, Concat(a, b))

        func Box(type string, a []uint8, b []uint8, c []uint8) []uint8 -> Box(type, Concat(a, b, c))

        func Box(type string, a []uint8, b []uint8, c []uint8, d []uint8) []uint8 -> Box(type, Concat(a, b, c, d))

        func Box(type string, a []uint8, b []uint8, c []uint8, d []uint8, e []uint8) []uint8 -> Box(type, Concat(a, b, c, d, e))

        func Box(type string, a []uint8, b []uint8, c []uint8, d []uint8, e []uint8, f []uint8) []uint8 -> Box(type, Concat(a, b, c, d, e, f))

        func Box(type string, a []uint8, b []uint8, c []uint8, d []uint8, e []uint8, f []uint8, g []uint8, h []uint8) []uint8 -> Box(type, Join([][]uint8{a, b, c, d, e, f, g, h}))

        /// ilst item with a single `data` child.
        func Item(type string, flags uint32, payload []uint8) []uint8 {
            return Box(type, Box("data", U32(flags), U32(0), payload))
        }

        func TextItem(type string, text string) []uint8 -> Item(type, 1, Encoding.UTF8.GetBytes(text))

        func FakeJpeg() []uint8 -> []uint8{0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4, 5, 6}

        func AudioBytes() []uint8 {
            let a = [AudioSamples * SampleSize]uint8
            for i in 0 ... a.Length {
                a[i] = uint8(i % 251)
            }
            return a
        }

        func TextSample(title string) []uint8 {
            let t = Encoding.UTF8.GetBytes(title)
            // Trailing 'encd' extension like ffmpeg/Apple writers add.
            let encd = Concat(U32(12), Latin1("encd"), U32(0x100))
            return Concat(U16(t.Length), t, encd)
        }

        func Tkhd(trackId uint32) []uint8 -> Box("tkhd", U32(3), U32(0), U32(0), U32(trackId), Zeros(68))

        func Mdhd(timescale uint32, duration uint32) []uint8 -> Box("mdhd", U32(0), U32(0), U32(0), U32(timescale), U32(duration), U32(0))

        func Hdlr(handler string) []uint8 -> Box("hdlr", U32(0), U32(0), Latin1(handler), Zeros(12), []uint8{0})

        func Stts(count uint32, delta uint32) []uint8 -> Box("stts", U32(0), U32(1), U32(count), U32(delta))

        func Stsz(sizes []uint32) []uint8 {
            let ms = MemoryStream()
            let head = Concat(U32(0), U32(0), U32(uint32(sizes.Length)))
            ms.Write(head, 0, head.Length)
            for s in sizes {
                let b = U32(s)
                ms.Write(b, 0, b.Length)
            }
            return Box("stsz", ms.ToArray())
        }

        func Stsc(samplesPerChunk uint32) []uint8 -> Box("stsc", U32(0), U32(1), U32(1), U32(samplesPerChunk), U32(1))

        func Stco(offsets []int64) []uint8 {
            let ms = MemoryStream()
            let head = Concat(U32(0), U32(uint32(offsets.Length)))
            ms.Write(head, 0, head.Length)
            for o in offsets {
                let b = U32(uint32(o))
                ms.Write(b, 0, b.Length)
            }
            return Box("stco", ms.ToArray())
        }

        func Trak(tkhd []uint8, extra []uint8, mdhd []uint8, hdlr []uint8, stbl []uint8) []uint8 {
            return Box("trak", tkhd, extra, Box("mdia", mdhd, hdlr, Box("minf", Box("stbl", stbl))))
        }

        /// Builds ftyp + mdat + moov. Chapter durations are in milliseconds.
        func Build(title string?, chapterTitles []string, chapterMs []int32, style ChapterStyle, cover []?uint8) []uint8 {
            let ftyp = Box("ftyp", Latin1("M4B "), U32(0), Latin1("M4B "), Latin1("isom"))
            let audio = AudioBytes()
            var text = []uint8{}
            let textSizes = List[uint32]()
            if style == ChapterStyle.QuickTimeTrack {
                for t in chapterTitles {
                    let s = TextSample(t)
                    text = Concat(text, s)
                    textSizes.Add(uint32(s.Length))
                }
            }
            let mdat = Box("mdat", audio, text)
            let baseOffset = int64(ftyp.Length + 8)

            let chunkCount = AudioSamples / SamplesPerChunk
            let audioOffsets = [chunkCount]int64
            for c in 0 ... chunkCount {
                audioOffsets[c] = baseOffset + int64(c * SamplesPerChunk * SampleSize)
            }
            let audioSizes = [AudioSamples]uint32
            for i in 0 ... AudioSamples {
                audioSizes[i] = uint32(SampleSize)
            }
            let entry = Box("mp4a", Zeros(6), U16(1), Zeros(8), U16(2), U16(16), U16(0), U16(0), U32(uint32(AudioTimescale) << 16))
            let stsd = Box("stsd", U32(0), U32(1), entry)
            let audioTref = if style == ChapterStyle.QuickTimeTrack { Box("tref", Box("chap", U32(2))) } else { []uint8{} }
            let audioTrak = Trak(
                Tkhd(1),
                audioTref,
                Mdhd(uint32(AudioTimescale), uint32(AudioSamples * SampleDelta)),
                Hdlr("soun"),
                Concat(stsd, Stts(uint32(AudioSamples), uint32(SampleDelta)), Stsc(uint32(SamplesPerChunk)), Stsz(audioSizes), Stco(audioOffsets))
            )

            var textTrak = []uint8{}
            if style == ChapterStyle.QuickTimeTrack {
                let textOffset = baseOffset + int64(audio.Length)
                let textSizesArr = textSizes.ToArray()
                let ms = MemoryStream()
                for i in 0 ... chapterMs.Length {
                    // Per-sample durations differ, so write one stts entry per chapter.
                    let b = Concat(U32(1), U32(uint32(chapterMs[i])))
                    ms.Write(b, 0, b.Length)
                }
                let sttsText = Box("stts", U32(0), U32(uint32(chapterMs.Length)), ms.ToArray())
                let stsdText = Box("stsd", U32(0), U32(1), Box("text", Zeros(6), U16(1), Zeros(51)))
                textTrak = Trak(
                    Tkhd(2),
                    []uint8{},
                    Mdhd(1000, uint32(Sum(chapterMs))),
                    Hdlr("text"),
                    Concat(stsdText, sttsText, Stsc(uint32(chapterMs.Length)), Stsz(textSizesArr), Stco([]int64{textOffset}))
                )
            }

            var ilstBody = []uint8{}
            if let t = title {
                ilstBody = Concat(ilstBody, TextItem("©nam", t))
            }
            ilstBody = Concat(ilstBody, TextItem("©ART", "Test Author"), TextItem("©alb", "Test Album"))
            if let c = cover {
                ilstBody = Concat(ilstBody, Item("covr", 13, c))
            }
            let meta = Box("meta", U32(0), Hdlr("mdir"), Box("ilst", ilstBody))
            var chpl = []uint8{}
            if style == ChapterStyle.Nero {
                let ms = MemoryStream()
                var start int64 = 0
                for i in 0 ... chapterMs.Length {
                    let t = Encoding.UTF8.GetBytes(chapterTitles[i])
                    let b = Concat(U64(uint64(start * 10000)), []uint8{uint8(t.Length)}, t)
                    ms.Write(b, 0, b.Length)
                    start = start + int64(chapterMs[i])
                }
                chpl = Box("chpl", U32(0x01000000), U32(0), []uint8{uint8(chapterMs.Length)}, ms.ToArray())
            }
            let udta = Box("udta", meta, chpl)
            let mvhd = Box("mvhd", U32(0), U32(0), U32(0), U32(1000), U32(4644), Zeros(80))
            let moov = Box("moov", mvhd, audioTrak, textTrak, udta)
            return Concat(ftyp, mdat, moov)
        }

        func Sum(values []int32) int32 {
            var s int32 = 0
            for v in values {
                s = s + v
            }
            return s
        }
    }
}
