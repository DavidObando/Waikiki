package Waikiki.Core

import System
import System.IO
import System.Text.Json.Nodes
import System.Threading.Tasks
import Waikiki.Yoto

/// User settings. The Yoto client ID is entered here (and never committed to the repo).
class AppSettings {
    var ClientId string? = nil
    var LastFolder string? = nil

    func ToJson() string {
        let o = JsonObject()
        o["clientId"] = ClientId
        o["lastFolder"] = LastFolder
        return o.ToJsonString()
    }

    shared {
        func FromJson(json string) AppSettings {
            let s = AppSettings()
            if let node = JsonNode.Parse(json) {
                s.ClientId = node["clientId"]?.ToString()
                s.LastFolder = node["lastFolder"]?.ToString()
            }
            return s
        }
    }
}

class AppSettingsStore {
    private let path string

    init(path string) {
        this.path = path
    }

    async func LoadAsync() AppSettings {
        if !File.Exists(path) {
            return AppSettings()
        }
        try {
            return AppSettings.FromJson(await File.ReadAllTextAsync(path))
        } catch (e Exception) {
            // A corrupt settings file should not prevent the app from starting.
            return AppSettings()
        }
    }

    async func SaveAsync(settings AppSettings) {
        let dir = Path.GetDirectoryName(path)
        if !string.IsNullOrEmpty(dir) {
            Directory.CreateDirectory(dir)
        }
        let temp = path + ".tmp"
        await File.WriteAllTextAsync(temp, settings.ToJson())
        File.Move(temp, path, true)
    }
}
