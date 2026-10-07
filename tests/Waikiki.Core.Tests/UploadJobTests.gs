package Waikiki.Core.Tests

import System
import System.Collections.Generic
import System.IO
import System.Net.Http
import System.Text.Json.Nodes
import System.Threading
import System.Threading.Tasks
import Waikiki.Core
import Waikiki.Mp4
import Waikiki.TestSupport
import Waikiki.Yoto
import Xunit

class Env {
    init(dir string, handler FakeHandler, job UploadJob, project AudiobookProject, states JobStateStore) {
        Dir = dir
        Handler = handler
        Job = job
        Project = project
        States = states
    }

    prop Dir string {
        get;
        init;
    }

    prop Handler FakeHandler {
        get;
        init;
    }

    prop Job UploadJob {
        get;
        init;
    }

    prop Project AudiobookProject {
        get;
        init;
    }

    prop States JobStateStore {
        get;
        init;
    }
}

class UploadJobTests {
    shared {
        private let Titles []string = []string{"Opening Credits", "Chapter One", "Chapter Two"}
        private let Millis []int32 = []int32{1500, 1500, 1000}

        private func UploadUrlJson() string -> "{\"upload\":{\"uploadId\":\"up\",\"uploadUrl\":\"https://s3.example/put\"}}"

        private func DoneJson(sha string) string {
            return "{\"transcode\":{\"uploadId\":\"up\",\"transcodedSha256\":\"" + sha + "\",\"transcodedInfo\":{\"duration\":2,\"codec\":\"opus\",\"channels\":\"stereo\",\"fileSize\":1234}}}"
        }

        private func EnqueueTrack(handler FakeHandler, sha string) {
            handler.Enqueue(200, UploadUrlJson())
            handler.Enqueue(200, "")
            handler.Enqueue(200, DoneJson(sha))
        }

        private func EnqueueCoverAndCard(handler FakeHandler, cardId string) {
            handler.Enqueue(200, "{\"coverImage\":{\"mediaId\":\"cov\",\"mediaUrl\":\"https://cdn/cov\"}}")
            handler.Enqueue(200, "{\"card\":{\"cardId\":\"" + cardId + "\"}}")
        }

        private async func Setup() Env {
            let dir = Path.Combine(Path.GetTempPath(), "waikiki-core-" + Guid.NewGuid().ToString("N"))
            Directory.CreateDirectory(dir)
            let file = Path.Combine(dir, "book.m4b")
            await File.WriteAllBytesAsync(file, Mp4Fixture.Build("My Book", Titles, Millis, ChapterStyle.QuickTimeTrack, Mp4Fixture.FakeJpeg()))
            let handler = FakeHandler()
            let http = HttpClient(handler)
            let store = MemoryTokenStore()
            await store.SaveAsync(TokenSet("access", "refresh", DateTimeOffset.UtcNow.AddHours(8.0)))
            let options = YotoOptions("test")
            options.PollInterval = TimeSpan.FromMilliseconds(1.0)
            let client = YotoClient(options, http, YotoAuth(options, http, store))
            let states = JobStateStore(Path.Combine(dir, "jobs"))
            let job = UploadJob(client, states, Path.Combine(dir, "tmp"))
            let project = AudiobookProject.Open(file, SplitOptions())
            project.IconMediaId = "ICON"
            return Env(dir, handler, job, project, states)
        }

        private func Cleanup(env Env) {
            if Directory.Exists(env.Dir) {
                Directory.Delete(env.Dir, true)
            }
        }
    }

    @Fact
    async func Open_Plans_One_Track_Per_Chapter_And_Reads_Metadata() {
        let env = await Setup()
        try {
            Assert.Equal(3, env.Project.Tracks.Count)
            Assert.Equal("My Book", env.Project.CardTitle)
            Assert.NotNull(env.Project.Cover)
            Assert.Equal("Chapter One", env.Project.Tracks[1].Title)
            Assert.True(env.Project.Tracks[0].IsIncluded)
            Assert.Equal(64, env.Project.Fingerprint.Length)
        } finally {
            Cleanup(env)
        }
    }

    @Fact
    async func Full_Run_Uploads_Every_Track_Then_Cover_Then_Creates_The_Card() {
        let env = await Setup()
        try {
            EnqueueTrack(env.Handler, "SHA-A")
            EnqueueTrack(env.Handler, "SHA-B")
            EnqueueTrack(env.Handler, "SHA-C")
            EnqueueCoverAndCard(env.Handler, "card1")
            let reports = List[JobProgress]()
            let progress = Progress[JobProgress]((p JobProgress) -> { reports.Add(p) })
            let cardId = await env.Job.RunAsync(env.Project, progress, CancellationToken.None)
            await Task.Delay(50)

            Assert.Equal("card1", cardId)
            Assert.Equal(11, env.Handler.Requests.Count)
            let cardRequest = env.Handler.Requests[10]
            Assert.Equal("https://api.yotoplay.com/content", cardRequest.Url)
            let json = JsonNode.Parse(cardRequest.Body)!!
            Assert.Equal("My Book", json["title"]!!.ToString())
            Assert.Equal("https://cdn/cov", json["metadata"]!!["cover"]!!["imageL"]!!.ToString())
            let chapters = json["content"]!!["chapters"]!!.AsArray()
            Assert.Equal(3, chapters.Count)
            Assert.Equal("Chapter One", chapters[1]!!["title"]!!.ToString())
            Assert.Equal("yoto:#SHA-B", chapters[1]!!["tracks"]!!.AsArray()[0]!!["trackUrl"]!!.ToString())
            Assert.Equal("yoto:#ICON", chapters[0]!!["display"]!!["icon16x16"]!!.ToString())

            // Progress never goes backwards and finishes at 100%.
            var last = 0.0
            for r in reports {
                Assert.True(r.Fraction >= last - 1e-9)
                last = r.Fraction
            }
            Assert.Equal(1.0, reports[reports.Count - 1].Fraction, 6)
            Assert.Equal("Done", reports[reports.Count - 1].Message)

            // Temporary split files are cleaned up.
            Assert.Empty(Directory.GetFiles(Path.Combine(env.Dir, "tmp")))
        } finally {
            Cleanup(env)
        }
    }

    @Fact
    async func Interrupted_Run_Resumes_Without_Reuploading_Finished_Tracks() {
        let env = await Setup()
        try {
            EnqueueTrack(env.Handler, "SHA-A")
            // Second track: upload URL fine, but the PUT fails.
            env.Handler.Enqueue(200, UploadUrlJson())
            env.Handler.Enqueue(500, "storage down")
            await Assert.ThrowsAsync[YotoApiException](() -> env.Job.RunAsync(env.Project, nil, CancellationToken.None))
            Assert.Equal(5, env.Handler.Requests.Count)
            Assert.Empty(Directory.GetFiles(Path.Combine(env.Dir, "tmp")))

            // Resume: only tracks 2 and 3 are uploaded.
            EnqueueTrack(env.Handler, "SHA-B")
            EnqueueTrack(env.Handler, "SHA-C")
            EnqueueCoverAndCard(env.Handler, "card1")
            let cardId = await env.Job.RunAsync(env.Project, nil, CancellationToken.None)
            Assert.Equal("card1", cardId)
            Assert.Equal(5 + 6 + 2, env.Handler.Requests.Count)
            let body = env.Handler.Requests[env.Handler.Requests.Count - 1].Body
            Assert.Contains("yoto:#SHA-A", body)
            Assert.Contains("yoto:#SHA-C", body)
        } finally {
            Cleanup(env)
        }
    }

    @Fact
    async func Rerun_After_Success_Updates_The_Same_Card_And_Reuses_Everything() {
        let env = await Setup()
        try {
            EnqueueTrack(env.Handler, "SHA-A")
            EnqueueTrack(env.Handler, "SHA-B")
            EnqueueTrack(env.Handler, "SHA-C")
            EnqueueCoverAndCard(env.Handler, "card1")
            await env.Job.RunAsync(env.Project, nil, CancellationToken.None)
            let before = env.Handler.Requests.Count

            // Rename a track and the card; no audio or cover is re-uploaded, only the card is updated.
            env.Project.Tracks[1].Title = "Renamed"
            env.Project.CardTitle = "My Book 2"
            env.Handler.Enqueue(200, "{\"card\":{\"cardId\":\"card1\"}}")
            let cardId = await env.Job.RunAsync(env.Project, nil, CancellationToken.None)
            Assert.Equal("card1", cardId)
            Assert.Equal(before + 1, env.Handler.Requests.Count)
            let body = env.Handler.Requests[before].Body
            Assert.Contains("\"cardId\":\"card1\"", body)
            Assert.Contains("Renamed", body)
            Assert.Contains("My Book 2", body)
        } finally {
            Cleanup(env)
        }
    }

    @Fact
    async func Excluded_Tracks_Are_Left_Out() {
        let env = await Setup()
        try {
            env.Project.Tracks[0].IsIncluded = false
            EnqueueTrack(env.Handler, "SHA-B")
            EnqueueTrack(env.Handler, "SHA-C")
            EnqueueCoverAndCard(env.Handler, "card1")
            await env.Job.RunAsync(env.Project, nil, CancellationToken.None)
            let json = JsonNode.Parse(env.Handler.Requests[env.Handler.Requests.Count - 1].Body)!!
            let chapters = json["content"]!!["chapters"]!!.AsArray()
            Assert.Equal(2, chapters.Count)
            Assert.Equal("Chapter One", chapters[0]!!["title"]!!.ToString())
        } finally {
            Cleanup(env)
        }
    }

    @Fact
    async func Running_With_Nothing_Selected_Is_Rejected() {
        let env = await Setup()
        try {
            for t in env.Project.Tracks {
                t.IsIncluded = false
            }
            await Assert.ThrowsAsync[InvalidOperationException](() -> env.Job.RunAsync(env.Project, nil, CancellationToken.None))
            Assert.Empty(env.Handler.Requests)
        } finally {
            Cleanup(env)
        }
    }

    @Fact
    func Job_State_Round_Trips() {
        let s = JobState("FP")
        s.CardId = "c"
        s.CoverHash = "h"
        s.CoverUrl = "u"
        s.Tracks["0-10"] = AudioUpload("up", "SHA", TimeSpan.FromSeconds(12.5), 99, "opus", "stereo")
        let back = JobState.FromJson(s.ToJson())
        Assert.Equal("FP", back.Fingerprint)
        Assert.Equal("c", back.CardId)
        Assert.Equal("u", back.CoverUrl)
        Assert.Equal("SHA", back.Tracks["0-10"].Sha256)
        Assert.Equal(TimeSpan.FromSeconds(12.5), back.Tracks["0-10"].Duration)
        Assert.Equal(int64(99), back.Tracks["0-10"].FileSize)
    }

    @Fact
    async func Settings_Round_Trip_And_Corrupt_File_Falls_Back_To_Defaults() {
        let dir = Path.Combine(Path.GetTempPath(), "waikiki-settings-" + Guid.NewGuid().ToString("N"))
        try {
            let store = AppSettingsStore(Path.Combine(dir, "settings.json"))
            Assert.Null((await store.LoadAsync()).ClientId)
            let s = AppSettings()
            s.ClientId = "abc"
            s.LastFolder = "/books"
            await store.SaveAsync(s)
            let back = await store.LoadAsync()
            Assert.Equal("abc", back.ClientId)
            Assert.Equal("/books", back.LastFolder)
            await File.WriteAllTextAsync(Path.Combine(dir, "settings.json"), "{not json")
            Assert.Null((await store.LoadAsync()).ClientId)
        } finally {
            if Directory.Exists(dir) {
                Directory.Delete(dir, true)
            }
        }
    }

    @Fact
    func Default_Icon_Prefers_Book_Tag_Then_Title_Then_First() {
        let icons = List[DisplayIcon]()
        icons.Add(DisplayIcon("m1", "Music notes", List[string]{"music"}))
        icons.Add(DisplayIcon("m2", "Open Book", List[string]()))
        icons.Add(DisplayIcon("m3", "Library", List[string]{"Book"}))
        Assert.Equal("m3", IconCatalog.PickDefault(icons))
        icons.RemoveAt(2)
        Assert.Equal("m2", IconCatalog.PickDefault(icons))
        icons.RemoveAt(1)
        Assert.Equal("m1", IconCatalog.PickDefault(icons))
        Assert.Null(IconCatalog.PickDefault(List[DisplayIcon]()))
    }
}
