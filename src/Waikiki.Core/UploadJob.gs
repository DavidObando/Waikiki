package Waikiki.Core

import System
import System.Collections.Generic
import System.IO
import System.Security.Cryptography
import System.Threading
import System.Threading.Tasks
import Waikiki.Mp4
import Waikiki.Yoto

/// Splits an audiobook into tracks, uploads each (skipping those already uploaded), uploads the cover
/// and creates or updates the Yoto card. Progress is saved after every step, so an interrupted run resumes.
class UploadJob {
    private let client YotoClient
    private let states JobStateStore
    private let tempDirectory string

    init(client YotoClient, states JobStateStore, tempDirectory string) {
        this.client = client
        this.states = states
        this.tempDirectory = tempDirectory
    }

    /// Returns the card ID.
    async func RunAsync(
        project AudiobookProject,
        progress IProgress[JobProgress]?,
        cancellationToken CancellationToken
    ) string {
        let tracks = List[PlannedTrack]()
        for t in project.Tracks {
            if t.IsIncluded {
                tracks.Add(t)
            }
        }
        if tracks.Count == 0 {
            throw InvalidOperationException("Select at least one track to upload.")
        }
        let state = await states.LoadAsync(project.Fingerprint)

        var totalBytes int64 = 0
        for t in tracks {
            totalBytes = totalBytes + t.Segment.AudioBytes
        }
        // Cover and card creation each count as a small fixed share so the bar never sits at 100% early.
        let overhead = float64(totalBytes) * 0.02 + 1.0
        let denominator = float64(totalBytes) + overhead * 2.0
        var doneBytes int64 = 0
        let Report = (message string, extra float64, number int32) -> {
            if let p = progress {
                p.Report(JobProgress(message, Math.Min(1.0, (float64(doneBytes) + extra) / denominator), number, tracks.Count))
            }
        }

        Directory.CreateDirectory(tempDirectory)
        using let source = FileStream(project.SourcePath, FileMode.Open, FileAccess.Read, FileShare.Read)
        let chapters = List[CardChapter]()
        for i in 0 ... tracks.Count {
            let track = tracks[i]
            let number = i + 1
            var upload AudioUpload? = nil
            if state.Tracks.ContainsKey(track.Key) {
                upload = state.Tracks[track.Key]
                Report("Track ${number}/${tracks.Count} already uploaded", 0.0, number)
            } else {
                let temp = Path.Combine(tempDirectory, "waikiki-${Guid.NewGuid():N}.m4a")
                try {
                    Report("Splitting track ${number}/${tracks.Count}", 0.0, number)
                    using let output = FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None)
                    ChapterSplitter.Write(source, project.Info, track.Segment, project.Tracks.Count, output)
                    output.Dispose()
                    let size = FileInfo(temp).Length
                    let sent = Progress[int64]((n int64) -> {
                        Report("Uploading track ${number}/${tracks.Count}", float64(n) / float64(Math.Max(1L, size)) * float64(track.Segment.AudioBytes), number)
                    })
                    upload = await client.UploadAudioFileAsync(temp, "audio/mp4", sent, cancellationToken)
                    state.Tracks[track.Key] = upload
                    await states.SaveAsync(state)
                } finally {
                    if File.Exists(temp) {
                        File.Delete(temp)
                    }
                }
            }
            doneBytes = doneBytes + track.Segment.AudioBytes
            let cardTracks = List[CardTrack]()
            cardTracks.Add(CardTrack(track.Title, upload!!, nil))
            chapters.Add(CardChapter(track.Title, project.IconMediaId, cardTracks))
        }

        var coverUrl string? = nil
        if let cover = project.Cover {
            Report("Uploading cover", 0.0, 0)
            let hash = Convert.ToHexString(SHA256.HashData(cover.Data))
            if state.CoverHash == hash && state.CoverUrl != nil {
                coverUrl = state.CoverUrl
            } else {
                let uploaded = await client.UploadCoverAsync(cover.Data, cover.MimeType, cancellationToken)
                coverUrl = uploaded.MediaUrl
                state.CoverHash = hash
                state.CoverUrl = uploaded.MediaUrl
                await states.SaveAsync(state)
            }
        }
        doneBytes = doneBytes + int64(overhead)

        Report("Creating card", 0.0, 0)
        let request = CardRequest(project.CardTitle, chapters)
        request.CardId = state.CardId
        request.CoverUrl = coverUrl
        let cardId = await client.CreateOrUpdateCardAsync(request, cancellationToken)
        state.CardId = cardId
        await states.SaveAsync(state)
        doneBytes = doneBytes + int64(overhead)
        Report("Done", 0.0, 0)
        return cardId
    }
}
