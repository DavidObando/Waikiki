package Waikiki.Core.Tests

import System
import System.Collections.Generic
import System.IO
import System.Net.Http
import System.Text
import System.Text.Json.Nodes
import System.Threading
import System.Threading.Tasks
import Waikiki.Core
import Waikiki.Core.Music
import Waikiki.Mp4
import Waikiki.TestSupport
import Waikiki.Yoto
import Xunit

class FakeSource : ITrackSource {
    init(key string, bytes int64) {
        this.key = key
        this.bytes = bytes
    }

    private let key string
    private let bytes int64

    prop Key string -> key
    prop AudioBytes int64 -> bytes
    prop Duration TimeSpan? -> nil

    func PrepareAsync(tempDirectory string, cancellationToken CancellationToken) Task[PreparedAudio] {
        throw InvalidOperationException("not used")
    }
}

class MusicTests {
    shared {
        private func NewDir() string {
            let d = Path.Combine(Path.GetTempPath(), "waikiki-music-" + Guid.NewGuid().ToString("N"))
            Directory.CreateDirectory(d)
            return d
        }

        private func Write(dir string, name string, bytes []uint8) string {
            let p = Path.Combine(dir, name)
            File.WriteAllBytes(p, bytes)
            return p
        }

        private func Cleanup(dir string) {
            if Directory.Exists(dir) {
                Directory.Delete(dir, true)
            }
        }

        private func Tagged(tags [][]uint8, v24 bool, frames int32) []uint8 {
            return Join(Mp3Fixture.Id3(tags, v24), Mp3Fixture.Frames(frames))
        }

        private func Join(a []uint8, b []uint8) []uint8 {
            let ms = MemoryStream()
            ms.Write(a, 0, a.Length)
            ms.Write(b, 0, b.Length)
            return ms.ToArray()
        }

        private func UploadUrlJson() string -> "{\"upload\":{\"uploadId\":\"up\",\"uploadUrl\":\"https://s3.example/put\"}}"

        private func DoneJson(sha string) string {
            return "{\"transcode\":{\"uploadId\":\"up\",\"transcodedSha256\":\"" + sha + "\",\"transcodedInfo\":{\"duration\":3,\"codec\":\"opus\",\"channels\":\"stereo\",\"fileSize\":999}}}"
        }

        private func EnqueueTrack(handler FakeHandler, sha string) {
            handler.Enqueue(200, UploadUrlJson())
            handler.Enqueue(200, "")
            handler.Enqueue(200, DoneJson(sha))
        }
    }

    // ---- natural sorting ----

    @Fact
    func Natural_Comparer_Orders_Numbers_Numerically_And_Ignores_Case() {
        let names = List[string]{"10.mp3", "2.mp3", "Z.mp3", "1.mp3", "a.mp3", "01 b.mp3"}
        names.Sort(NaturalComparer())
        Assert.Equal([]string{"01 b.mp3", "1.mp3", "2.mp3", "10.mp3", "a.mp3", "Z.mp3"}, names.ToArray())
        Assert.Equal(0, NaturalComparer().Compare("Track 07", "track 7"))
    }

    // ---- ID3 ----

    @Fact
    func Id3v23_Text_Frames_Track_Disc_And_Front_Cover_Are_Read() {
        let dir = NewDir()
        try {
            let tags = [][]uint8{
                Mp3Fixture.TagFrame("TIT2", Mp3Fixture.TextBody("Café ♪", 1), false),
                Mp3Fixture.TagFrame("TPE1", Mp3Fixture.TextBody("The Band", 0), false),
                Mp3Fixture.TagFrame("TALB", Mp3Fixture.TextBody("Album Name", 0), false),
                Mp3Fixture.TagFrame("TRCK", Mp3Fixture.TextBody("3/12", 0), false),
                Mp3Fixture.TagFrame("TPOS", Mp3Fixture.TextBody("2/2", 0), false),
                Mp3Fixture.TagFrame("APIC", Mp3Fixture.PictureBody(0, Mp3Fixture.FakeJpeg()), false),
                Mp3Fixture.TagFrame("APIC", Mp3Fixture.PictureBody(3, Mp3Fixture.FakeJpeg2()), false)
            }
            let info = Id3Reader.Read(Write(dir, "a.mp3", Tagged(tags, false, 10)))
            Assert.Equal("Café ♪", info.Title)
            Assert.Equal("The Band", info.Artist)
            Assert.Equal("Album Name", info.Album)
            Assert.Equal(3, info.TrackNumber)
            Assert.Equal(2, info.DiscNumber)
            Assert.NotNull(info.Cover)
            Assert.Equal(CoverFormat.Jpeg, info.Cover!!.Format)
            // The front cover (type 3, 10 bytes) wins over the earlier "other" picture (8 bytes).
            Assert.Equal(10, info.Cover!!.Data.Length)
        } finally {
            Cleanup(dir)
        }
    }

    @Fact
    func Id3v24_Syncsafe_Sizes_And_Utf8_Are_Read() {
        let dir = NewDir()
        try {
            let tags = [][]uint8{
                Mp3Fixture.TagFrame("TIT2", Mp3Fixture.TextBody("Ñandú", 3), true),
                Mp3Fixture.TagFrame("TRCK", Mp3Fixture.TextBody("7", 0), true)
            }
            let info = Id3Reader.Read(Write(dir, "a.mp3", Tagged(tags, true, 5)))
            Assert.Equal("Ñandú", info.Title)
            Assert.Equal(7, info.TrackNumber)
        } finally {
            Cleanup(dir)
        }
    }

    @Fact
    func Mp3_Duration_Uses_The_Xing_Frame_Count_When_Present() {
        let dir = NewDir()
        try {
            let audio = Join(Mp3Fixture.XingFrame(1000), Mp3Fixture.Frames(3))
            let bytes = Join(Mp3Fixture.Id3(List[[]uint8]().ToArray(), false), audio)
            let info = Id3Reader.Read(Write(dir, "x.mp3", bytes))
            Assert.InRange(info.Duration!!.TotalSeconds, 26.0, 26.2)
        } finally {
            Cleanup(dir)
        }
    }

    @Fact
    func Mp3_Duration_Falls_Back_To_Bitrate_For_Cbr_Files() {
        let dir = NewDir()
        try {
            let info = Id3Reader.Read(Write(dir, "c.mp3", Mp3Fixture.Build("T", nil, nil, nil, 100)))
            // 100 frames of 1152 samples at 44.1 kHz is 2.612 s; the bitrate estimate is within 2%.
            Assert.InRange(info.Duration!!.TotalSeconds, 2.56, 2.67)
        } finally {
            Cleanup(dir)
        }
    }

    @Fact
    func Id3v1_Is_Used_When_There_Is_No_Id3v2() {
        let dir = NewDir()
        try {
            let tag = [128]uint8
            let text = Encoding.Latin1.GetBytes("TAGOld Song")
            Array.Copy(text, 0, tag, 0, text.Length)
            let artist = Encoding.Latin1.GetBytes("Old Artist")
            Array.Copy(artist, 0, tag, 33, artist.Length)
            tag[125] = 0
            tag[126] = 4
            let info = Id3Reader.Read(Write(dir, "v1.mp3", Join(Mp3Fixture.Frames(4), tag)))
            Assert.Equal("Old Song", info.Title)
            Assert.Equal("Old Artist", info.Artist)
            Assert.Equal(4, info.TrackNumber)
        } finally {
            Cleanup(dir)
        }
    }

    @Fact
    func Damaged_Or_Foreign_Files_Yield_Empty_Info_Instead_Of_Throwing() {
        let dir = NewDir()
        try {
            let junk = Write(dir, "junk.mp3", []uint8{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12})
            let info = AudioFileReader.Read(junk)
            Assert.Null(info.Title)
            Assert.Null(info.Duration)
            let truncated = Write(dir, "cut.mp3", Encoding.Latin1.GetBytes("ID3\u0003\u0000\u0000\u0000\u0000\u0010\u0000TIT2"))
            Assert.Null(AudioFileReader.Read(truncated).Title)
            let wav = Write(dir, "s.wav", []uint8{1, 2, 3})
            Assert.Null(AudioFileReader.Read(wav).Title)
        } finally {
            Cleanup(dir)
        }
    }

    @Fact
    func M4a_Tags_Track_And_Disc_Number_Are_Read() {
        let dir = NewDir()
        try {
            let bytes = Mp4Fixture.Build("Song Title", []string{"x"}, []int32{1000}, ChapterStyle.None, nil, 5, 2)
            let info = AudioFileReader.Read(Write(dir, "s.m4a", bytes))
            Assert.Equal("Song Title", info.Title)
            Assert.Equal("Test Author", info.Artist)
            Assert.Equal(5, info.TrackNumber)
            Assert.Equal(2, info.DiscNumber)
            Assert.True(info.Duration!!.TotalSeconds > 4.0)
        } finally {
            Cleanup(dir)
        }
    }

    @Fact
    func Content_Types_Match_What_Yoto_Accepted() {
        Assert.Equal("audio/mpeg", AudioFileReader.ContentTypeFor("a.MP3"))
        Assert.Equal("audio/mp4", AudioFileReader.ContentTypeFor("a.m4a"))
        Assert.Equal("audio/aac", AudioFileReader.ContentTypeFor("a.aac"))
        Assert.Equal("audio/wav", AudioFileReader.ContentTypeFor("a.wav"))
        Assert.Equal("audio/flac", AudioFileReader.ContentTypeFor("a.flac"))
        Assert.Equal("audio/ogg", AudioFileReader.ContentTypeFor("a.opus"))
        Assert.Null(AudioFileReader.ContentTypeFor("a.txt"))
        Assert.False(AudioFileReader.IsSupported("cover.jpg"))
    }

    // ---- folder scanning ----

    @Fact
    func Untagged_Files_Sort_Naturally_And_Titles_Come_From_File_Names() {
        let dir = NewDir()
        try {
            Write(dir, "10 - Ten.mp3", Mp3Fixture.Frames(2))
            Write(dir, "2 - Two.mp3", Mp3Fixture.Frames(2))
            Write(dir, "1. One.mp3", Mp3Fixture.Frames(2))
            Write(dir, ".hidden.mp3", Mp3Fixture.Frames(2))
            Write(dir, "notes.txt", []uint8{1})
            let p = PlaylistProject.OpenMusicFolder(dir)
            Assert.Equal(PlaylistKind.Music, p.Kind)
            Assert.Equal(3, p.Tracks.Count)
            Assert.Equal([]string{"One", "Two", "Ten"}, []string{p.Tracks[0].Title, p.Tracks[1].Title, p.Tracks[2].Title})
        } finally {
            Cleanup(dir)
        }
    }

    @Fact
    func When_Every_File_Has_A_Track_Number_It_Beats_The_File_Name_And_Disc_Comes_First() {
        let dir = NewDir()
        try {
            Write(dir, "a.mp3", Mp3Fixture.Build("Third", nil, nil, "1", 2))
            Write(dir, "b.mp3", Mp3Fixture.Build("First", nil, nil, "1", 2))
            Write(dir, "c.mp3", Mp3Fixture.Build("Second", nil, nil, "2", 2))
            // a.mp3 gets disc 2 through a TPOS frame.
            let withDisc = Mp3Fixture.Id3([][]uint8{
                Mp3Fixture.TagFrame("TIT2", Mp3Fixture.TextBody("Third", 0), false),
                Mp3Fixture.TagFrame("TRCK", Mp3Fixture.TextBody("1", 0), false),
                Mp3Fixture.TagFrame("TPOS", Mp3Fixture.TextBody("2", 0), false)
            }, false)
            Write(dir, "a.mp3", Join(withDisc, Mp3Fixture.Frames(2)))
            let p = PlaylistProject.OpenMusicFolder(dir)
            Assert.Equal([]string{"First", "Second", "Third"}, []string{p.Tracks[0].Title, p.Tracks[1].Title, p.Tracks[2].Title})
        } finally {
            Cleanup(dir)
        }
    }

    @Fact
    func Card_Title_Is_The_Shared_Album_Else_The_Folder_Name() {
        let dir = NewDir()
        try {
            Write(dir, "1.mp3", Mp3Fixture.Build("A", "Artist", "Greatest Hits", "1", 2))
            Write(dir, "2.mp3", Mp3Fixture.Build("B", "Artist", "greatest hits", "2", 2))
            let same = PlaylistProject.OpenMusicFolder(dir)
            Assert.Equal("Greatest Hits", same.CardTitle)
            Assert.Equal("Artist", same.Artist)
            Write(dir, "3.mp3", Mp3Fixture.Build("C", "Someone Else", "Other", "3", 2))
            let mixed = PlaylistProject.OpenMusicFolder(dir)
            Assert.Equal(Path.GetFileName(dir), mixed.CardTitle)
            Assert.Equal("Various artists", mixed.Artist)
        } finally {
            Cleanup(dir)
        }
    }

    @Fact
    func Cover_Prefers_Embedded_Art_Then_A_Folder_Image_Then_None() {
        let dir = NewDir()
        try {
            Write(dir, "1.mp3", Mp3Fixture.Frames(2))
            Assert.Null(PlaylistProject.OpenMusicFolder(dir).Cover)
            Write(dir, "Folder.JPG", Mp3Fixture.FakeJpeg2())
            let folderCover = PlaylistProject.OpenMusicFolder(dir).Cover
            Assert.NotNull(folderCover)
            Assert.Equal(10, folderCover!!.Data.Length)
            let embedded = Mp3Fixture.Id3([][]uint8{Mp3Fixture.TagFrame("APIC", Mp3Fixture.PictureBody(3, Mp3Fixture.FakeJpeg()), false)}, false)
            Write(dir, "2.mp3", Join(embedded, Mp3Fixture.Frames(2)))
            Assert.Equal(8, PlaylistProject.OpenMusicFolder(dir).Cover!!.Data.Length)
        } finally {
            Cleanup(dir)
        }
    }

    @Fact
    func Empty_Or_Missing_Folders_Are_Rejected_With_A_Clear_Error() {
        let dir = NewDir()
        try {
            Write(dir, "readme.txt", []uint8{1})
            let ex = Assert.Throws[InvalidOperationException](() -> { PlaylistProject.OpenMusicFolder(dir) })
            Assert.Contains("No supported audio files", ex.Message)
            Assert.Throws[DirectoryNotFoundException](() -> { PlaylistProject.OpenMusicFolder(Path.Combine(dir, "nope")) })
        } finally {
            Cleanup(dir)
        }
    }

    @Fact
    func File_Track_Source_Key_Is_Stable_Until_The_File_Changes_And_Uploads_The_Original() {
        let dir = NewDir()
        try {
            let path = Write(dir, "a.mp3", Mp3Fixture.Frames(2))
            let a = FileTrackSource(path, "audio/mpeg", nil)
            let b = FileTrackSource(path, "audio/mpeg", nil)
            Assert.Equal(a.Key, b.Key)
            Assert.StartsWith("f:", a.Key)
            Write(dir, "a.mp3", Mp3Fixture.Frames(3))
            Assert.NotEqual(a.Key, FileTrackSource(path, "audio/mpeg", nil).Key)
            let prepared = a.PrepareAsync(Path.Combine(dir, "tmp"), CancellationToken.None).GetAwaiter().GetResult()
            Assert.Equal(path, prepared.Path)
            Assert.False(prepared.IsTemporary)
            prepared.Cleanup()
            Assert.True(File.Exists(path))
        } finally {
            Cleanup(dir)
        }
    }

    // ---- limits and icons ----

    @Fact
    func Problems_Flags_Too_Many_Tracks_Oversized_Tracks_And_Empty_Selection() {
        let tracks = List[PlannedTrack]()
        for i in 0 ... 101 {
            tracks.Add(PlannedTrack(FakeSource("k${i}", 1000L), "T${i}"))
        }
        let p = PlaylistProject(PlaylistKind.Music, "/x", "fp", tracks)
        let problems = p.Problems()
        Assert.Single(problems)
        Assert.Contains("at most 100 tracks", problems[0])
        tracks[0].IsIncluded = false
        Assert.Empty(p.Problems())
        tracks[1] = PlannedTrack(FakeSource("big", 150L * 1024L * 1024L), "Huge")
        Assert.Contains("per-track limit", p.Problems()[0])
        for t in tracks {
            t.IsIncluded = false
        }
        Assert.Contains("Select at least one", p.Problems()[0])
    }

    @Fact
    func Music_Mode_Prefers_Music_Icons() {
        let icons = List[DisplayIcon]()
        icons.Add(DisplayIcon("b", "Book", List[string]{"book"}))
        icons.Add(DisplayIcon("m", "Notes", List[string]{"music"}))
        let p = PlaylistProject(PlaylistKind.Music, "/x", "fp", List[PlannedTrack]())
        Assert.Equal("m", IconCatalog.PickDefault(icons, p.IconTags))
        let book = PlaylistProject(PlaylistKind.Audiobook, "/x", "fp", List[PlannedTrack]())
        Assert.Equal("b", IconCatalog.PickDefault(icons, book.IconTags))
    }

    // ---- uploading a music folder ----

    @Fact
    async func Music_Files_Upload_Untouched_With_Their_Content_Type_And_The_Card_Updates_When_A_Song_Is_Added() {
        let dir = NewDir()
        try {
            Write(dir, "1.mp3", Mp3Fixture.Build("One", nil, "Mix", "1", 4))
            Write(dir, "2.mp3", Mp3Fixture.Build("Two", nil, "Mix", "2", 4))
            let handler = FakeHandler()
            let http = HttpClient(handler)
            let store = MemoryTokenStore()
            await store.SaveAsync(TokenSet("access", "refresh", DateTimeOffset.UtcNow.AddHours(8.0)))
            let options = YotoOptions("test")
            options.PollInterval = TimeSpan.FromMilliseconds(1.0)
            let client = YotoClient(options, http, YotoAuth(options, http, store))
            let tmp = Path.Combine(dir, "tmp-out")
            let job = UploadJob(client, JobStateStore(Path.Combine(dir, "jobs-out")), tmp)

            let project = PlaylistProject.OpenMusicFolder(dir)
            Assert.Equal("Mix", project.CardTitle)
            EnqueueTrack(handler, "SHA-1")
            EnqueueTrack(handler, "SHA-2")
            handler.Enqueue(200, "{\"card\":{\"cardId\":\"music1\"}}")
            let cardId = await job.RunAsync(project, nil, CancellationToken.None)
            Assert.Equal("music1", cardId)

            // Two tracks: [urlJson, PUT, poll] x2, then the card. No cover (none found), no temp files.
            Assert.Equal(7, handler.Requests.Count)
            Assert.Equal("audio/mpeg", handler.Requests[1].ContentType)
            Assert.Equal(FileInfo(Path.Combine(dir, "1.mp3")).Length, handler.Requests[1].ContentLength!!)
            Assert.False(Directory.Exists(tmp) && Directory.GetFiles(tmp).Length > 0)
            let json = JsonNode.Parse(handler.Requests[6].Body)!!
            let chapters = json["content"]!!["chapters"]!!.AsArray()
            Assert.Equal(2, chapters.Count)
            Assert.Equal("One", chapters[0]!!["title"]!!.ToString())
            Assert.Equal("yoto:#SHA-2", chapters[1]!!["tracks"]!!.AsArray()[0]!!["trackUrl"]!!.ToString())

            // Add a third song and run again: only the new file uploads, and the same card is updated.
            Write(dir, "3.mp3", Mp3Fixture.Build("Three", nil, "Mix", "3", 4))
            let again = PlaylistProject.OpenMusicFolder(dir)
            Assert.Equal(project.Fingerprint, again.Fingerprint)
            EnqueueTrack(handler, "SHA-3")
            handler.Enqueue(200, "{\"card\":{\"cardId\":\"music1\"}}")
            await job.RunAsync(again, nil, CancellationToken.None)
            Assert.Equal(7 + 3 + 1, handler.Requests.Count)
            let update = handler.Requests[handler.Requests.Count - 1].Body
            Assert.Contains("\"cardId\":\"music1\"", update)
            Assert.Contains("yoto:#SHA-1", update)
            Assert.Contains("yoto:#SHA-3", update)
        } finally {
            Cleanup(dir)
        }
    }

    @Fact
    async func Too_Many_Tracks_Is_Rejected_Before_Any_Request_Is_Made() {
        let handler = FakeHandler()
        let http = HttpClient(handler)
        let store = MemoryTokenStore()
        await store.SaveAsync(TokenSet("a", "r", DateTimeOffset.UtcNow.AddHours(1.0)))
        let options = YotoOptions("test")
        let client = YotoClient(options, http, YotoAuth(options, http, store))
        let dir = NewDir()
        try {
            let job = UploadJob(client, JobStateStore(Path.Combine(dir, "jobs")), Path.Combine(dir, "tmp"))
            let tracks = List[PlannedTrack]()
            for i in 0 ... 101 {
                tracks.Add(PlannedTrack(FakeSource("k${i}", 10L), "T${i}"))
            }
            let project = PlaylistProject(PlaylistKind.Music, "/x", "fp", tracks)
            let ex = await Assert.ThrowsAsync[InvalidOperationException](() -> job.RunAsync(project, nil, CancellationToken.None))
            Assert.Contains("at most 100", ex.Message)
            Assert.Empty(handler.Requests)
        } finally {
            Cleanup(dir)
        }
    }
}
