package Waikiki.Yoto.Tests

import System
import System.Collections.Generic
import System.IO
import System.Text.Json.Nodes
import System.Threading
import System.Threading.Tasks
import System.Net.Http
import Waikiki.TestSupport
import Waikiki.Yoto
import Xunit

class YotoTests {
    shared {
        private let None CancellationToken = CancellationToken.None

        private func Options() YotoOptions {
            let o = YotoOptions("test-client")
            o.PollInterval = TimeSpan.FromMilliseconds(1.0)
            o.PollTimeout = TimeSpan.FromSeconds(5.0)
            o.RateLimitBackoff = TimeSpan.FromMilliseconds(1.0)
            return o
        }

        private func FreshTokens() TokenSet -> TokenSet("access-1", "refresh-1", DateTimeOffset.UtcNow.AddHours(8.0))

        private func ExpiredTokens() TokenSet -> TokenSet("access-old", "refresh-old", DateTimeOffset.UtcNow.AddMinutes(-5.0))

        private async func Setup(tokens TokenSet) (FakeHandler, MemoryTokenStore, YotoClient) {
            let handler = FakeHandler()
            let http = HttpClient(handler)
            let store = MemoryTokenStore()
            await store.SaveAsync(tokens)
            let options = Options()
            let auth = YotoAuth(options, http, store)
            return (handler, store, YotoClient(options, http, auth))
        }

        private func Upload(sha string, seconds float64, bytes int64) AudioUpload {
            return AudioUpload("u", sha, TimeSpan.FromSeconds(seconds), bytes, "opus", "stereo")
        }

        private let UploadUrlJson string = "{\"upload\":{\"uploadId\":\"up1\",\"uploadUrl\":\"https://s3.example/put?sig=abc\"}}"
        private let PendingJson string = "{\"transcode\":{\"uploadId\":\"up1\",\"transcodedSha256\":null,\"failedUploadSha256\":null,\"progress\":{\"phase\":\"transcoding\"}}}"
        private let DoneJson string = "{\"transcode\":{\"uploadId\":\"up1\",\"transcodedSha256\":\"SHA-OUT\",\"transcodedInfo\":{\"duration\":1046,\"codec\":\"opus\",\"format\":\"opus\",\"channels\":\"stereo\",\"fileSize\":8979556}}}"
        private let FailedJson string = "{\"transcode\":{\"uploadId\":\"up1\",\"transcodedSha256\":null,\"startedAt\":null,\"failedUploadSha256\":\"BAD\",\"failedOptionsHash\":\"H\"}}"
    }

    @Fact
    func Pkce_Challenge_Matches_Rfc7636_Vector() {
        Assert.Equal("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", Pkce.CreateChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
    }

    @Fact
    func Pkce_Verifier_And_State_Are_Url_Safe_And_Unique() {
        let v = Pkce.CreateVerifier()
        Assert.True(v.Length >= 43 && v.Length <= 128)
        Assert.DoesNotContain("+", v)
        Assert.DoesNotContain("/", v)
        Assert.DoesNotContain("=", v)
        Assert.NotEqual(v, Pkce.CreateVerifier())
        Assert.NotEqual(Pkce.CreateState(), Pkce.CreateState())
    }

    @Fact
    func Authorize_Url_Has_Required_Parameters() {
        let auth = YotoAuth(Options(), HttpClient(FakeHandler()), MemoryTokenStore())
        let url = auth.BuildAuthorizeUrl("CHAL", "STATE")
        Assert.StartsWith("https://login.yotoplay.com/authorize?", url)
        Assert.Contains("client_id=test-client", url)
        Assert.Contains("response_type=code", url)
        Assert.Contains("code_challenge=CHAL", url)
        Assert.Contains("code_challenge_method=S256", url)
        Assert.Contains("state=STATE", url)
        Assert.Contains("audience=https%3A%2F%2Fapi.yotoplay.com", url)
        Assert.Contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A8787%2Fcallback", url)
        Assert.Contains("offline_access", url)
    }

    @Fact
    func TokenSet_Json_Round_Trips() {
        let t = TokenSet("a", "r", DateTimeOffset.FromUnixTimeSeconds(1791428269))
        let back = TokenSet.FromJson(t.ToJson())
        Assert.Equal("a", back.AccessToken)
        Assert.Equal("r", back.RefreshToken)
        Assert.Equal(t.ExpiresAt, back.ExpiresAt)
    }

    @Fact
    func OAuth_Response_Keeps_Previous_Refresh_Token_When_Absent() {
        let now = DateTimeOffset.UtcNow
        let t = TokenSet.FromOAuthResponse("{\"access_token\":\"x\",\"expires_in\":28800}", now, "old-refresh")
        Assert.Equal("old-refresh", t.RefreshToken)
        Assert.Equal(now.AddSeconds(28800.0), t.ExpiresAt)
        let t2 = TokenSet.FromOAuthResponse("{\"access_token\":\"x\",\"refresh_token\":\"new\",\"expires_in\":10}", now, "old-refresh")
        Assert.Equal("new", t2.RefreshToken)
    }

    @Fact
    async func File_Token_Store_Round_Trips_And_Restricts_Permissions() {
        let dir = Path.Combine(Path.GetTempPath(), "waikiki-test-" + Guid.NewGuid().ToString("N"))
        let path = Path.Combine(dir, "nested", "tokens.json")
        try {
            let store = FileTokenStore(path)
            Assert.Null(await store.LoadAsync())
            await store.SaveAsync(FreshTokens())
            let loaded = await store.LoadAsync()
            Assert.Equal("access-1", loaded!!.AccessToken)
            Assert.False(File.Exists(path + ".tmp"))
            if !OperatingSystem.IsWindows() {
                Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite, File.GetUnixFileMode(path))
            }
            await store.ClearAsync()
            Assert.Null(await store.LoadAsync())
        } finally {
            if Directory.Exists(dir) {
                Directory.Delete(dir, true)
            }
        }
    }

    @Fact
    async func Valid_Token_Is_Used_Without_Refreshing() {
        let (handler, _, _) = await Setup(FreshTokens())
        let store = MemoryTokenStore()
        await store.SaveAsync(FreshTokens())
        let auth = YotoAuth(Options(), HttpClient(handler), store)
        let t = await auth.GetValidTokensAsync(None)
        Assert.Equal("access-1", t.AccessToken)
        Assert.Empty(handler.Requests)
    }

    @Fact
    async func Expired_Token_Is_Refreshed_And_New_Refresh_Token_Is_Persisted() {
        let handler = FakeHandler()
        handler.Enqueue(200, "{\"access_token\":\"access-2\",\"refresh_token\":\"refresh-2\",\"expires_in\":28800}")
        let store = MemoryTokenStore()
        await store.SaveAsync(ExpiredTokens())
        let auth = YotoAuth(Options(), HttpClient(handler), store)
        let t = await auth.GetValidTokensAsync(None)
        Assert.Equal("access-2", t.AccessToken)
        let saved = await store.LoadAsync()
        Assert.Equal("refresh-2", saved!!.RefreshToken)
        Assert.Equal(1, handler.Requests.Count)
        Assert.Equal("https://login.yotoplay.com/oauth/token", handler.Requests[0].Url)
        Assert.Contains("grant_type=refresh_token", handler.Requests[0].Body)
        Assert.Contains("refresh_token=refresh-old", handler.Requests[0].Body)
        Assert.Contains("client_id=test-client", handler.Requests[0].Body)
    }

    @Fact
    async func Rejected_Refresh_Requires_Sign_In_Again() {
        let handler = FakeHandler()
        handler.Enqueue(403, "{\"error\":\"invalid_grant\"}")
        let store = MemoryTokenStore()
        await store.SaveAsync(ExpiredTokens())
        let auth = YotoAuth(Options(), HttpClient(handler), store)
        await Assert.ThrowsAsync[YotoAuthException](() -> auth.GetValidTokensAsync(None))
    }

    @Fact
    async func Missing_Session_Requires_Sign_In() {
        let auth = YotoAuth(Options(), HttpClient(FakeHandler()), MemoryTokenStore())
        await Assert.ThrowsAsync[YotoAuthException](() -> auth.GetValidTokensAsync(None))
    }

    @Fact
    async func Upload_Puts_Without_Bearer_And_Polls_Until_Transcoded() {
        let (handler, _, client) = await Setup(FreshTokens())
        handler.Enqueue(200, UploadUrlJson)
        handler.Enqueue(200, "")
        handler.Enqueue(202, PendingJson)
        handler.Enqueue(202, PendingJson)
        handler.Enqueue(200, DoneJson)
        let audio = []uint8{1, 2, 3, 4, 5}
        var reported int64 = 0
        let progress = Progress[int64]((n int64) -> { reported = n })
        let result = await client.UploadAudioAsync(MemoryStream(audio), "audio/mp4", progress, None)

        Assert.Equal("SHA-OUT", result.Sha256)
        Assert.Equal("up1", result.UploadId)
        Assert.Equal(TimeSpan.FromSeconds(1046.0), result.Duration)
        Assert.Equal(int64(8979556), result.FileSize)
        Assert.Equal("opus", result.Codec)
        Assert.Equal("stereo", result.Channels)

        Assert.Equal(5, handler.Requests.Count)
        Assert.Equal("Bearer access-1", handler.Requests[0].Authorization)
        Assert.Equal("https://api.yotoplay.com/media/transcode/audio/uploadUrl", handler.Requests[0].Url)
        Assert.Equal("PUT", handler.Requests[1].Method)
        Assert.Equal("https://s3.example/put?sig=abc", handler.Requests[1].Url)
        Assert.Null(handler.Requests[1].Authorization)
        Assert.Equal("audio/mp4", handler.Requests[1].ContentType)
        Assert.Equal(int64(5), handler.Requests[1].ContentLength!!)
        Assert.Equal("https://api.yotoplay.com/media/upload/up1/transcoded?loudnorm=false", handler.Requests[2].Url)
        Assert.Equal("Bearer access-1", handler.Requests[4].Authorization)
        await Task.Delay(10)
        Assert.Equal(int64(5), reported)
    }

    @Fact
    async func Failed_Transcode_Is_Detected_Even_Though_Status_Is_202() {
        let (handler, _, client) = await Setup(FreshTokens())
        handler.Enqueue(200, UploadUrlJson)
        handler.Enqueue(200, "")
        handler.Enqueue(202, FailedJson)
        let ex = await Assert.ThrowsAsync[YotoTranscodeException](() -> client.UploadAudioAsync(MemoryStream([]uint8{1}), "audio/mp4", nil, None))
        Assert.Equal("up1", ex.UploadId)
    }

    @Fact
    async func Transcode_Wait_Times_Out() {
        let handler = FakeHandler()
        let http = HttpClient(handler)
        let store = MemoryTokenStore()
        await store.SaveAsync(FreshTokens())
        let options = Options()
        options.PollTimeout = TimeSpan.FromMilliseconds(30.0)
        let client = YotoClient(options, http, YotoAuth(options, http, store))
        for i in 0 ... 200 {
            handler.Enqueue(202, PendingJson)
        }
        await Assert.ThrowsAsync[TimeoutException](() -> client.WaitForTranscodeAsync("up1", None))
    }

    @Fact
    async func Rate_Limited_Request_Is_Retried_Using_Retry_After() {
        let (handler, _, client) = await Setup(FreshTokens())
        handler.EnqueueRetryAfter(429, 0)
        handler.Enqueue(200, "{\"cards\":[{\"cardId\":\"c1\",\"title\":\"Book\"}]}")
        let cards = await client.GetMyCardsAsync(None)
        Assert.Equal(1, cards.Count)
        Assert.Equal("c1", cards[0].CardId)
        Assert.Equal(2, handler.Requests.Count)
    }

    @Fact
    async func Rate_Limit_Gives_Up_After_Max_Retries() {
        let (handler, _, client) = await Setup(FreshTokens())
        for i in 0 ... 6 {
            handler.Enqueue(429, "slow")
        }
        let ex = await Assert.ThrowsAsync[YotoApiException](() -> client.GetMyCardsAsync(None))
        Assert.Equal(429, ex.StatusCode)
        Assert.Equal(6, handler.Requests.Count)
    }

    @Fact
    async func Unauthorized_Triggers_One_Refresh_And_Retry() {
        let (handler, store, client) = await Setup(FreshTokens())
        handler.Enqueue(401, "expired")
        handler.Enqueue(200, "{\"access_token\":\"access-2\",\"refresh_token\":\"refresh-2\",\"expires_in\":28800}")
        handler.Enqueue(200, "{\"cards\":[]}")
        let cards = await client.GetMyCardsAsync(None)
        Assert.Empty(cards)
        Assert.Equal("Bearer access-1", handler.Requests[0].Authorization)
        Assert.Equal("Bearer access-2", handler.Requests[2].Authorization)
        let saved = await store.LoadAsync()
        Assert.Equal("refresh-2", saved!!.RefreshToken)
    }

    @Fact
    async func Persistent_Unauthorized_Surfaces_As_Api_Error() {
        let (handler, _, client) = await Setup(FreshTokens())
        handler.Enqueue(401, "no")
        handler.Enqueue(200, "{\"access_token\":\"access-2\",\"expires_in\":28800}")
        handler.Enqueue(401, "still no")
        let ex = await Assert.ThrowsAsync[YotoApiException](() -> client.GetMyCardsAsync(None))
        Assert.Equal(401, ex.StatusCode)
    }

    @Fact
    async func Cover_Upload_Sends_Raw_Body_And_Parses_Response() {
        let (handler, _, client) = await Setup(FreshTokens())
        handler.Enqueue(200, "{\"coverImage\":{\"mediaId\":\"m1\",\"mediaUrl\":\"https://card-content.yotoplay.com/x/m1\"}}")
        let cover = await client.UploadCoverAsync([]uint8{0xFF, 0xD8, 0xFF}, "image/jpeg", None)
        Assert.Equal("m1", cover.MediaId)
        Assert.Equal("https://card-content.yotoplay.com/x/m1", cover.MediaUrl)
        Assert.Equal("POST", handler.Requests[0].Method)
        Assert.Equal("https://api.yotoplay.com/media/coverImage/user/me/upload?autoconvert=true", handler.Requests[0].Url)
        Assert.Equal("image/jpeg", handler.Requests[0].ContentType)
    }

    @Fact
    async func Public_Icons_Are_Parsed() {
        let (handler, _, client) = await Setup(FreshTokens())
        handler.Enqueue(200, "{\"displayIcons\":[{\"mediaId\":\"i1\",\"title\":\"Music notes\",\"publicTags\":[\"music\",\"note\"]},{\"mediaId\":\"i2\",\"title\":\"Book\"}]}")
        let icons = await client.GetPublicIconsAsync(None)
        Assert.Equal(2, icons.Count)
        Assert.Equal("i1", icons[0].MediaId)
        Assert.Equal("Music notes", icons[0].Title)
        Assert.Equal(2, icons[0].Tags.Count)
        Assert.Empty(icons[1].Tags)
        Assert.Equal("https://api.yotoplay.com/media/displayIcons/user/yoto", handler.Requests[0].Url)
    }

    @Fact
    func Card_Json_Has_The_Shape_Yoto_Accepted() {
        let t1 = CardTrack("One", Upload("SHA1", 100.0, 1000), nil)
        let t2 = CardTrack("Two", Upload("SHA2", 50.4, 500), "ICON-T")
        let chapters = List[CardChapter]()
        chapters.Add(CardChapter("One", "ICON-1", List[CardTrack]{t1}))
        chapters.Add(CardChapter("Two", nil, List[CardTrack]{t2}))
        let request = CardRequest("My Book", chapters)
        request.CoverUrl = "https://cover/url"
        let json = YotoClient.BuildCardJson(request)

        Assert.Equal("My Book", json["title"]!!.ToString())
        Assert.Null(json["cardId"])
        Assert.Equal("https://cover/url", json["metadata"]!!["cover"]!!["imageL"]!!.ToString())
        Assert.Equal("150", json["metadata"]!!["media"]!!["duration"]!!.ToString())
        Assert.Equal("1500", json["metadata"]!!["media"]!!["fileSize"]!!.ToString())
        let ch = json["content"]!!["chapters"]!!.AsArray()
        Assert.Equal(2, ch.Count)
        Assert.Equal("01", ch[0]!!["key"]!!.ToString())
        Assert.Equal("1", ch[0]!!["overlayLabel"]!!.ToString())
        Assert.Equal("yoto:#ICON-1", ch[0]!!["display"]!!["icon16x16"]!!.ToString())
        let track = ch[0]!!["tracks"]!!.AsArray()[0]!!
        Assert.Equal("yoto:#SHA1", track["trackUrl"]!!.ToString())
        Assert.Equal("audio", track["type"]!!.ToString())
        Assert.Equal("100", track["duration"]!!.ToString())
        Assert.Equal("stereo", track["channels"]!!.ToString())
        // Track icon falls back to the chapter icon; a chapter without an icon and a track icon keeps the track's.
        Assert.Equal("yoto:#ICON-1", track["display"]!!["icon16x16"]!!.ToString())
        Assert.Null(ch[1]!!["display"])
        Assert.Equal("yoto:#ICON-T", ch[1]!!["tracks"]!!.AsArray()[0]!!["display"]!!["icon16x16"]!!.ToString())
    }

    @Fact
    async func Create_Card_Posts_Json_And_Returns_Card_Id_And_Update_Sends_Card_Id() {
        let (handler, _, client) = await Setup(FreshTokens())
        handler.Enqueue(200, "{\"card\":{\"cardId\":\"44thi\"}}")
        handler.Enqueue(200, "{\"card\":{\"cardId\":\"44thi\"}}")
        let chapters = List[CardChapter]()
        chapters.Add(CardChapter("One", nil, List[CardTrack]{CardTrack("One", Upload("SHA1", 10.0, 100), nil)}))
        let request = CardRequest("Book", chapters)
        let id = await client.CreateOrUpdateCardAsync(request, None)
        Assert.Equal("44thi", id)
        Assert.Equal("https://api.yotoplay.com/content", handler.Requests[0].Url)
        Assert.Equal("POST", handler.Requests[0].Method)
        Assert.Contains("application/json", handler.Requests[0].ContentType!!)
        Assert.DoesNotContain("cardId", handler.Requests[0].Body)

        request.CardId = "44thi"
        await client.CreateOrUpdateCardAsync(request, None)
        Assert.Contains("\"cardId\":\"44thi\"", handler.Requests[1].Body)
    }
}
