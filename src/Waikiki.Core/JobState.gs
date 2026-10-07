package Waikiki.Core

import System
import System.Collections.Generic
import System.Globalization
import System.IO
import System.Text.Json.Nodes
import System.Threading.Tasks
import Waikiki.Yoto

/// What an interrupted upload has already achieved, so a rerun skips finished tracks and updates
/// the same card instead of creating a duplicate.
class JobState {
    init(fingerprint string) {
        Fingerprint = fingerprint
    }

    prop Fingerprint string {
        get;
        init;
    }

    var CardId string? = nil
    var CoverHash string? = nil
    var CoverUrl string? = nil
    let Tracks Dictionary[string, AudioUpload] = Dictionary[string, AudioUpload]()

    func ToJson() string {
        let tracks = JsonObject()
        for kv in Tracks {
            let t = JsonObject()
            t["uploadId"] = kv.Value.UploadId
            t["sha256"] = kv.Value.Sha256
            t["durationSeconds"] = kv.Value.Duration.TotalSeconds
            t["fileSize"] = kv.Value.FileSize
            t["codec"] = kv.Value.Codec
            t["channels"] = kv.Value.Channels
            tracks[kv.Key] = t
        }
        let root = JsonObject()
        root["fingerprint"] = Fingerprint
        root["cardId"] = CardId
        root["coverHash"] = CoverHash
        root["coverUrl"] = CoverUrl
        root["tracks"] = tracks
        return root.ToJsonString()
    }

    shared {
        func FromJson(json string) JobState {
            guard let root = JsonNode.Parse(json) else {
                throw FormatException("Empty job state.")
            }
            let state = JobState(root["fingerprint"]?.ToString() ?? "")
            state.CardId = root["cardId"]?.ToString()
            state.CoverHash = root["coverHash"]?.ToString()
            state.CoverUrl = root["coverUrl"]?.ToString()
            if let tracks = root["tracks"] {
                for kv in tracks.AsObject() {
                    let t = kv.Value
                    state.Tracks[kv.Key] = AudioUpload(
                        JsonHelpers.Str(t, "uploadId") ?? "",
                        JsonHelpers.Str(t, "sha256") ?? "",
                        TimeSpan.FromSeconds(JsonHelpers.Num(t, "durationSeconds")),
                        int64(JsonHelpers.Num(t, "fileSize")),
                        JsonHelpers.Str(t, "codec") ?? "",
                        JsonHelpers.Str(t, "channels") ?? "stereo"
                    )
                }
            }
            return state
        }
    }
}

class JobStateStore {
    private let directory string

    init(directory string) {
        this.directory = directory
    }

    private func PathFor(fingerprint string) string -> Path.Combine(directory, fingerprint + ".json")

    async func LoadAsync(fingerprint string) JobState {
        let path = PathFor(fingerprint)
        if File.Exists(path) {
            try {
                let state = JobState.FromJson(await File.ReadAllTextAsync(path))
                if state.Fingerprint == fingerprint {
                    return state
                }
            } catch (e Exception) {
                // Unreadable state just means starting fresh.
            }
        }
        return JobState(fingerprint)
    }

    async func SaveAsync(state JobState) {
        Directory.CreateDirectory(directory)
        let path = PathFor(state.Fingerprint)
        let temp = path + ".tmp"
        await File.WriteAllTextAsync(temp, state.ToJson())
        File.Move(temp, path, true)
    }

    func Delete(fingerprint string) {
        let path = PathFor(fingerprint)
        if File.Exists(path) {
            File.Delete(path)
        }
    }
}
