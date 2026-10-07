package Waikiki.Core

import System
import System.Collections.Generic
import System.IO
import System.Security.Cryptography
import System.Threading
import System.Threading.Tasks
import Waikiki.Mp4
import Waikiki.Yoto

/// Uploads each included track (skipping those already uploaded), uploads the cover and creates or updates
/// the Yoto card. Audiobook tracks are cut from the .m4b first; music files upload as they are.
/// Progress is saved after every step, so an interrupted run resumes.
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
        project PlaylistProject,
        progress IProgress[JobProgress]?,
        cancellationToken CancellationToken
    ) string {
        let problems = project.Problems()
        if problems.Count > 0 {
            throw InvalidOperationException(problems[0])
        }
        let tracks = List[PlannedTrack]()
        for t in project.Tracks {
            if t.IsIncluded {
                tracks.Add(t)
            }
        }
        let state = await states.LoadAsync(project.Fingerprint)

        var totalBytes int64 = 0
        for t in tracks {
            totalBytes = totalBytes + t.AudioBytes
        }
        // Cover and card creation each count as a small fixed share so the bar never sits at 100% early.
        let overhead = float64(totalBytes) * 0.02 + 1.0
        let denominator = float64(totalBytes) + overhead * 2.0
        var doneBytes float64 = 0.0
        // The caller passes the completed-bytes value explicitly, so a report is always computed from the
        // state at the moment it was made and never from a counter that has moved on.
        let Report = (message string, done float64, extra float64, number int32) -> {
            if let p = progress {
                p.Report(JobProgress(message, Math.Min(1.0, (done + extra) / denominator), number, tracks.Count))
            }
        }

        let chapters = List[CardChapter]()
        for i in 0 ... tracks.Count {
            let track = tracks[i]
            let number = i + 1
            var upload AudioUpload? = nil
            if state.Tracks.ContainsKey(track.Key) {
                upload = state.Tracks[track.Key]
                Report("Track ${number}/${tracks.Count} already uploaded", doneBytes, 0.0, number)
            } else {
                Report("Preparing track ${number}/${tracks.Count}", doneBytes, 0.0, number)
                let prepared = await track.Source.PrepareAsync(tempDirectory, cancellationToken)
                try {
                    let size = Math.Max(1L, FileInfo(prepared.Path).Length)
                    let baseDone = doneBytes
                    let sent = ByteProgress((n int64) -> {
                        let share = float64(n) / float64(size) * float64(track.AudioBytes)
                        Report("Uploading track ${number}/${tracks.Count}", baseDone, share, number)
                    })
                    upload = await client.UploadAudioFileAsync(prepared.Path, prepared.ContentType, sent, cancellationToken)
                    state.Tracks[track.Key] = upload
                    await states.SaveAsync(state)
                } finally {
                    prepared.Cleanup()
                }
            }
            doneBytes = doneBytes + float64(track.AudioBytes)
            let cardTracks = List[CardTrack]()
            cardTracks.Add(CardTrack(track.Title, upload!!, nil))
            chapters.Add(CardChapter(track.Title, project.IconMediaId, cardTracks))
        }

        var coverUrl string? = nil
        if let cover = project.Cover {
            Report("Uploading cover", doneBytes, 0.0, 0)
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
        doneBytes = doneBytes + overhead

        Report("Creating card", doneBytes, 0.0, 0)
        let request = CardRequest(project.CardTitle, chapters)
        request.CardId = state.CardId
        request.CoverUrl = coverUrl
        let cardId = await client.CreateOrUpdateCardAsync(request, cancellationToken)
        state.CardId = cardId
        await states.SaveAsync(state)
        doneBytes = doneBytes + overhead
        Report("Done", doneBytes, 0.0, 0)
        return cardId
    }
}
