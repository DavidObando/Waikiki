package Waikiki.Yoto.Tests

import System
import System.IO
import System.Net.Http
import System.Threading
import Waikiki.Yoto
import Xunit

/// Opt-in tests against the real Yoto API; they create and then delete a card on the signed-in account.
/// Set WAIKIKI_YOTO_CLIENT_ID, WAIKIKI_YOTO_TOKENS (JSON with access_token, refresh_token),
/// WAIKIKI_TEST_AUDIO (an .m4a) and WAIKIKI_TEST_COVER (a .jpg). Without them the test returns immediately.
class LiveTests {
    shared {
        private func CardRequestWithTitle(r CardRequest, title string) CardRequest {
            let n = CardRequest(title, r.Chapters)
            n.CardId = r.CardId
            n.CoverUrl = r.CoverUrl
            return n
        }
        private let RedIcon16 string = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGM4YWNDEmIY1TCqYfhqAACrxkAQIqaBzAAAAABJRU5ErkJggg=="
    }

    @Fact
    async func Live_Upload_Create_Update_Delete_Round_Trip() {
        let clientId = Environment.GetEnvironmentVariable("WAIKIKI_YOTO_CLIENT_ID")
        let tokensPath = Environment.GetEnvironmentVariable("WAIKIKI_YOTO_TOKENS")
        let audioPath = Environment.GetEnvironmentVariable("WAIKIKI_TEST_AUDIO")
        let coverPath = Environment.GetEnvironmentVariable("WAIKIKI_TEST_COVER")
        if string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(tokensPath) || string.IsNullOrEmpty(audioPath) || string.IsNullOrEmpty(coverPath) {
            return
        }
        let raw = await File.ReadAllTextAsync(tokensPath)
        let store = MemoryTokenStore()
        await store.SaveAsync(TokenSet.FromOAuthResponse(raw, DateTimeOffset.UtcNow, nil))
        let options = YotoOptions(clientId)
        let http = HttpClient()
        let client = YotoClient(options, http, YotoAuth(options, http, store))
        let ct = CancellationToken.None

        let icons = await client.GetPublicIconsAsync(ct)
        Console.WriteLine("LIVE public icons: ${icons.Count}, first=${icons[0].Title} ${icons[0].MediaId}")
        Assert.True(icons.Count > 10)

        let userIcon = await client.UploadIconAsync(Convert.FromBase64String(RedIcon16), "image/png", "waikiki-test.png", ct)
        Console.WriteLine("LIVE uploaded icon: ${userIcon}")

        let cover = await client.UploadCoverAsync(await File.ReadAllBytesAsync(coverPath), "image/jpeg", ct)
        Console.WriteLine("LIVE cover: ${cover.MediaUrl}")

        var sent int64 = 0
        let audio = await client.UploadAudioFileAsync(audioPath, "audio/mp4", Progress[int64]((n int64) -> { sent = n }), ct)
        Console.WriteLine("LIVE audio: sha=${audio.Sha256} dur=${audio.Duration} size=${audio.FileSize} codec=${audio.Codec} ch=${audio.Channels} sent=${sent}")
        Assert.Equal(FileInfo(audioPath).Length, sent)

        let chapters = System.Collections.Generic.List[CardChapter]()
        let tracks = System.Collections.Generic.List[CardTrack]()
        tracks.Add(CardTrack("Waikiki live test", audio, nil))
        chapters.Add(CardChapter("Waikiki live test", userIcon, tracks))
        let request = CardRequest("Waikiki live test (auto-deleted)", chapters)
        request.CoverUrl = cover.MediaUrl
        let cardId = await client.CreateOrUpdateCardAsync(request, ct)
        Console.WriteLine("LIVE created card: ${cardId}")
        try {
            request.CardId = cardId
            let again = await client.CreateOrUpdateCardAsync(CardRequestWithTitle(request, "Waikiki live test renamed (auto-deleted)"), ct)
            Assert.Equal(cardId, again)
            let mine = await client.GetMyCardsAsync(ct)
            var found string? = nil
            for c in mine {
                if c.CardId == cardId {
                    found = c.Title
                }
            }
            Console.WriteLine("LIVE listed title after update: ${found}")
            Assert.Equal("Waikiki live test renamed (auto-deleted)", found)
        } finally {
            await client.DeleteCardAsync(cardId, ct)
            Console.WriteLine("LIVE deleted card ${cardId}")
        }
    }

}
