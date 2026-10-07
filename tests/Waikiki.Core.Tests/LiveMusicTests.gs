package Waikiki.Core.Tests

import System
import System.Collections.Generic
import System.IO
import System.Net.Http
import System.Threading
import Waikiki.Core
import Waikiki.TestSupport
import Waikiki.Yoto
import Xunit

/// Opt-in: uploads a real music folder to Yoto through UploadJob, checks the card, then deletes it.
/// Set WAIKIKI_YOTO_CLIENT_ID, WAIKIKI_YOTO_TOKENS (JSON with access_token) and WAIKIKI_TEST_MUSIC_DIR.
class LiveMusicTests {
    @Fact
    async func Live_Music_Folder_Uploads_Creates_And_Deletes_A_Card() {
        let clientId = Environment.GetEnvironmentVariable("WAIKIKI_YOTO_CLIENT_ID")
        let tokensPath = Environment.GetEnvironmentVariable("WAIKIKI_YOTO_TOKENS")
        let musicDir = Environment.GetEnvironmentVariable("WAIKIKI_TEST_MUSIC_DIR")
        if string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(tokensPath) || string.IsNullOrEmpty(musicDir) {
            return
        }
        let store = MemoryTokenStore()
        await store.SaveAsync(TokenSet.FromOAuthResponse(await File.ReadAllTextAsync(tokensPath), DateTimeOffset.UtcNow, nil))
        let options = YotoOptions(clientId)
        let http = HttpClient()
        let client = YotoClient(options, http, YotoAuth(options, http, store))
        let ct = CancellationToken.None

        let work = Path.Combine(Path.GetTempPath(), "waikiki-live-" + Guid.NewGuid().ToString("N"))
        try {
            let project = PlaylistProject.OpenMusicFolder(musicDir)
            project.CardTitle = "Waikiki music live test (auto-deleted)"
            let icons = await client.GetPublicIconsAsync(ct)
            project.IconMediaId = IconCatalog.PickDefault(icons, project.IconTags)
            Console.WriteLine("LIVE tracks=${project.Tracks.Count} icon=${project.IconMediaId} cover=${project.Cover != nil}")
            // Reverse the order to prove the card follows the review order.
            project.Tracks.Reverse()

            let progress = SyncProgress[JobProgress]()
            let job = UploadJob(client, JobStateStore(Path.Combine(work, "jobs")), Path.Combine(work, "tmp"))
            let cardId = await job.RunAsync(project, progress, ct)
            let reports = progress.ToList()
            Console.WriteLine("LIVE card=${cardId} reports=${reports.Count} last=${reports[reports.Count - 1].Message} ${reports[reports.Count - 1].Fraction}")
            try {
                let mine = await client.GetMyCardsAsync(ct)
                var found string? = nil
                for c in mine {
                    if c.CardId == cardId {
                        found = c.Title
                    }
                }
                Assert.Equal("Waikiki music live test (auto-deleted)", found)
                Assert.Equal(1.0, reports[reports.Count - 1].Fraction, 6)
            } finally {
                await client.DeleteCardAsync(cardId, ct)
                Console.WriteLine("LIVE deleted ${cardId}")
            }
        } finally {
            if Directory.Exists(work) {
                Directory.Delete(work, true)
            }
        }
    }
}
