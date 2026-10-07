package Waikiki.Mp4.Tests

import System
import System.IO
import Waikiki.Mp4
import Xunit

class Mp4ReaderTests {
    shared {
        private let Titles []string = []string{"Opening Credits", "Chapter One", "Chapter Two"}
        private let Millis []int32 = []int32{1500, 1500, 1000}

        private func Open(style ChapterStyle) Mp4Info {
            let bytes = Mp4Fixture.Build("My Book", Titles, Millis, style, Mp4Fixture.FakeJpeg())
            return Mp4Reader.Read(MemoryStream(bytes))
        }
    }

    @Fact
    func Reads_Tags_And_Cover() {
        let info = Open(ChapterStyle.None)
        Assert.Equal("My Book", info.Title)
        Assert.Equal("Test Author", info.Artist)
        Assert.Equal("Test Album", info.Album)
        Assert.NotNull(info.Cover)
        Assert.Equal(CoverFormat.Jpeg, info.Cover!!.Format)
        Assert.Equal("image/jpeg", info.Cover!!.MimeType)
        Assert.Equal(10, info.Cover!!.Data.Length)
    }

    @Fact
    func Reads_Audio_Track_Layout() {
        let info = Open(ChapterStyle.None)
        let audio = info.AudioTrack!!
        Assert.Equal("soun", audio.HandlerType)
        Assert.Equal("mp4a", audio.SampleEntry)
        Assert.Equal(2, audio.Channels)
        Assert.Equal(44100, audio.SampleRate)
        Assert.Equal(200, audio.Samples!!.SampleCount)
        Assert.InRange(info.Duration.TotalSeconds, 4.64, 4.65)
    }

    @Fact
    func Sample_Offsets_Follow_Chunk_Layout() {
        let info = Open(ChapterStyle.None)
        let table = info.AudioTrack!!.Samples!!
        let offsets = table.GetOffsets()
        Assert.Equal(200, offsets.Length)
        Assert.Equal(offsets[0] + 10, offsets[1])
        // Sample 25 starts the second chunk, which is contiguous with the first in this fixture.
        Assert.Equal(offsets[0] + 250, offsets[25])
        let durations = table.GetDurations()
        Assert.Equal(uint32(1024), durations[199])
    }

    @Fact
    func Reads_QuickTime_Chapter_Track() {
        let info = Open(ChapterStyle.QuickTimeTrack)
        Assert.True(info.HasEmbeddedChapters)
        Assert.Equal(3, info.Chapters.Count)
        Assert.Equal("Opening Credits", info.Chapters[0].Title)
        Assert.Equal("Chapter Two", info.Chapters[2].Title)
        Assert.Equal(TimeSpan.Zero, info.Chapters[0].Start)
        Assert.Equal(TimeSpan.FromSeconds(1.5), info.Chapters[1].Start)
        Assert.Equal(TimeSpan.FromSeconds(3.0), info.Chapters[2].Start)
        // The last chapter runs to the end of the audio (4.644 s), not the end of the text track (4.0 s).
        Assert.InRange(info.Chapters[2].End.TotalSeconds, 4.64, 4.65)
    }

    @Fact
    func Reads_Nero_Chapter_List() {
        let info = Open(ChapterStyle.Nero)
        Assert.True(info.HasEmbeddedChapters)
        Assert.Equal(3, info.Chapters.Count)
        Assert.Equal("Chapter One", info.Chapters[1].Title)
        Assert.Equal(TimeSpan.FromSeconds(1.5), info.Chapters[1].Start)
        Assert.Equal(info.Chapters[2].Start, info.Chapters[1].End)
    }

    @Fact
    func Synthesizes_A_Single_Chapter_When_None_Embedded() {
        let info = Open(ChapterStyle.None)
        Assert.False(info.HasEmbeddedChapters)
        Assert.Equal(1, info.Chapters.Count)
        Assert.Equal("My Book", info.Chapters[0].Title)
        Assert.Equal(info.Duration, info.Chapters[0].End)
    }

    @Fact
    func Throws_When_There_Is_No_Moov() {
        let junk = []uint8{0, 0, 0, 8, 102, 114, 101, 101}
        Assert.Throws[InvalidDataException](() -> { Mp4Reader.Read(MemoryStream(junk)) })
    }

    // Opt-in smoke test against a real file: set WAIKIKI_TEST_M4B to a path.
    @Fact
    func Reads_Real_File_When_Configured() {
        let path = Environment.GetEnvironmentVariable("WAIKIKI_TEST_M4B")
        if string.IsNullOrEmpty(path) || !File.Exists(path) {
            return
        }
        let info = Mp4Reader.Read(path)
        Console.WriteLine("title=${info.Title} chapters=${info.Chapters.Count} duration=${info.Duration} cover=${info.Cover?.Data.Length}")
        for c in info.Chapters {
            Console.WriteLine("  ${c.Start} - ${c.End} ${c.Title}")
        }
        Assert.True(info.Chapters.Count > 0)
    }
}
