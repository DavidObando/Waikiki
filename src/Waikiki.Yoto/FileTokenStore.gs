package Waikiki.Yoto

import System
import System.IO
import System.Threading.Tasks

/// Stores tokens as JSON in a file readable only by the current user (mode 600 on Unix).
/// Writes go to a temp file first and are moved into place, so a crash never leaves a half-written
/// file (important because refresh tokens are single-use). An OS-keychain store can replace this
/// by implementing ITokenStore.
class FileTokenStore : ITokenStore {
    private let path string

    init(path string) {
        this.path = path
    }

    async func LoadAsync() TokenSet? {
        if !File.Exists(path) {
            return nil
        }
        let json = await File.ReadAllTextAsync(path)
        return TokenSet.FromJson(json)
    }

    async func SaveAsync(tokens TokenSet) {
        let dir = Path.GetDirectoryName(path)
        if !string.IsNullOrEmpty(dir) {
            Directory.CreateDirectory(dir)
        }
        let temp = path + ".tmp"
        await File.WriteAllTextAsync(temp, tokens.ToJson())
        if !OperatingSystem.IsWindows() {
            File.SetUnixFileMode(temp, UnixFileMode.UserRead | UnixFileMode.UserWrite)
        }
        File.Move(temp, path, true)
    }

    func ClearAsync() Task {
        if File.Exists(path) {
            File.Delete(path)
        }
        return Task.CompletedTask
    }
}
