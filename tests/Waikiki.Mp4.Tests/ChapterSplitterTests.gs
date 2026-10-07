package Waikiki.Mp4.Tests

import System
import System.Collections.Generic
import System.IO
import System.Text
import Waikiki.Mp4
import Waikiki.TestSupport
import Xunit

class ChapterSplitterTests {
    shared {
        private let Titles []string = []string{"Opening Credits", "Chapter One", "Chapter Two"}
        private let Millis []int32 = []int32{1500, 1500, 1000}

        private func Fixture(style ChapterStyle) []uint8 -> Mp4Fixture.Build("My Book", Titles, Millis, style, Mp4Fixture.FakeJpeg())

        private func SampleBytes(stream Stream, info Mp4Info, index int32) []uint8 {
            let table = info.AudioTrack!!.Samples!!
            let bytes = [int32(table.Sizes[index])]uint8
            stream.Position = table.GetOffsets()[index]
            stream.ReadExactly(bytes, 0, bytes.Length)
            return bytes
        }

        private func WriteSegment(source []uint8, info Mp4Info, segment TrackSegment, total int32) []uint8 {
            let output = MemoryStream()
            ChapterSplitter.Write(MemoryStream(source), info, segment, total, output)
            return output.ToArray()
        }
    }

    @Fact
    func Plan_Maps_Chapters_To_Contiguous_Sample_Ranges() {
        let source = Fixture(ChapterStyle.QuickTimeTrack)
        let info = Mp4Reader.Read(MemoryStream(source))
        let plan = ChapterSplitter.Plan(info, SplitOptions())
        Assert.Equal(3, plan.Count)
        Assert.Equal(0, plan[0].StartSample)
        Assert.Equal(plan[0].EndSample, plan[1].StartSample)
        Assert.Equal(plan[1].EndSample, plan[2].StartSample)
        Assert.Equal(200, plan[2].EndSample)
        Assert.Equal("Chapter One", plan[1].Title)
        Assert.Equal(65, plan[1].StartSample)
        Assert.Equal(1, plan[0].Index)
        Assert.Equal(3, plan[2].Index)
        Assert.Equal(int64(2000), plan[0].AudioBytes + plan[1].AudioBytes + plan[2].AudioBytes)
    }

    @Fact
    func Written_Segment_Is_A_Valid_Faststart_M4a_With_Identical_Samples() {
        let source = Fixture(ChapterStyle.QuickTimeTrack)
        let info = Mp4Reader.Read(MemoryStream(source))
        let plan = ChapterSplitter.Plan(info, SplitOptions())
        let segment = plan[1]
        let bytes = WriteSegment(source, info, segment, plan.Count)

        let top = BoxRef.Children(bytes, 0, bytes.Length)
        Assert.Equal("ftyp", top[0].Type)
        Assert.Equal("moov", top[1].Type)
        Assert.Equal("mdat", top[2].Type)
        Assert.Equal(3, top.Count)

        let outInfo = Mp4Reader.Read(MemoryStream(bytes))
        let outTrack = outInfo.AudioTrack!!
        Assert.Equal("Chapter One", outInfo.Title)
        Assert.Equal("My Book", outInfo.Album)
        Assert.Equal("Test Author", outInfo.Artist)
        Assert.Equal(segment.SampleCount, outTrack.Samples!!.SampleCount)
        Assert.Equal("mp4a", outTrack.SampleEntry)
        Assert.Equal(2, outTrack.Channels)
        Assert.Equal(44100, outTrack.SampleRate)
        Assert.Equal(info.AudioTrack!!.Timescale, outTrack.Timescale)
        Assert.Equal(info.AudioTrack!!.SampleDescription, outTrack.SampleDescription)
        Assert.Equal(0, outTrack.ChapterTrackIds.Count)
        Assert.False(outInfo.HasEmbeddedChapters)

        let inStream = MemoryStream(source)
        let outStream = MemoryStream(bytes)
        for i in 0 ... segment.SampleCount {
            Assert.Equal(SampleBytes(inStream, info, segment.StartSample + i), SampleBytes(outStream, outInfo, i))
        }
        // No leaked chapter reference or text track.
        Assert.DoesNotContain("tref", Encoding.Latin1.GetString(bytes))
    }

    @Fact
    func Segments_Cover_Every_Sample_Exactly_Once() {
        let source = Fixture(ChapterStyle.QuickTimeTrack)
        let info = Mp4Reader.Read(MemoryStream(source))
        let plan = ChapterSplitter.Plan(info, SplitOptions())
        var total int32 = 0
        var ticks uint64 = 0
        for segment in plan {
            let out = Mp4Reader.Read(MemoryStream(WriteSegment(source, info, segment, plan.Count)))
            total = total + out.AudioTrack!!.Samples!!.SampleCount
            ticks = ticks + out.AudioTrack!!.MediaDuration
        }
        Assert.Equal(200, total)
        Assert.Equal(uint64(200 * 1024), ticks)
    }

    @Fact
    func Long_Chapters_Are_Sub_Split_To_Respect_Limits() {
        let source = Fixture(ChapterStyle.None)
        let info = Mp4Reader.Read(MemoryStream(source))
        let options = SplitOptions()
        options.MaxDuration = TimeSpan.FromSeconds(1.0)
        let plan = ChapterSplitter.Plan(info, options)
        Assert.Equal(5, plan.Count)
        Assert.Equal("My Book (1/5)", plan[0].Title)
        Assert.Equal("My Book (5/5)", plan[4].Title)
        for segment in plan {
            Assert.True(segment.Duration <= TimeSpan.FromSeconds(1.0))
        }
        Assert.Equal(0, plan[0].StartSample)
        Assert.Equal(200, plan[4].EndSample)
    }

    @Fact
    func Byte_Limit_Also_Forces_A_Split() {
        let source = Fixture(ChapterStyle.None)
        let info = Mp4Reader.Read(MemoryStream(source))
        let options = SplitOptions()
        options.MaxBytes = 500
        let plan = ChapterSplitter.Plan(info, options)
        Assert.Equal(4, plan.Count)
        for segment in plan {
            Assert.True(segment.AudioBytes <= 500)
        }
    }

    @Fact
    func Plan_Rejects_Non_Aac_Audio() {
        let source = Fixture(ChapterStyle.None)
        let info = Mp4Reader.Read(MemoryStream(source))
        info.AudioTrack!!.SampleEntry = "ec-3"
        Assert.Throws[NotSupportedException](() -> { ChapterSplitter.Plan(info, SplitOptions()) })
    }

    // Opt-in: set WAIKIKI_TEST_M4B to a real file and WAIKIKI_TEST_OUT to an output directory.
    @Fact
    func Splits_Real_File_When_Configured() {
        let path = Environment.GetEnvironmentVariable("WAIKIKI_TEST_M4B")
        let outDir = Environment.GetEnvironmentVariable("WAIKIKI_TEST_OUT")
        if string.IsNullOrEmpty(path) || string.IsNullOrEmpty(outDir) || !File.Exists(path) {
            return
        }
        Directory.CreateDirectory(outDir)
        let info = Mp4Reader.Read(path)
        let plan = ChapterSplitter.Plan(info, SplitOptions())
        using let source = FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)
        for segment in plan {
            let file = Path.Combine(outDir, "${segment.Index:D2}.m4a")
            using let output = FileStream(file, FileMode.Create, FileAccess.Write)
            ChapterSplitter.Write(source, info, segment, plan.Count, output)
        }
        Assert.True(plan.Count >= 20)
    }
}
