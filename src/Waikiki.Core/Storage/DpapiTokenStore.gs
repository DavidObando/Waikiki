package Waikiki.Core.Storage

import System
import System.IO
import System.Security.Cryptography
import System.Text
import System.Threading.Tasks
import Waikiki.Yoto

/// Windows only: the token JSON is protected with DPAPI (current user scope) and written to a file.
/// Only the same Windows user on the same machine can decrypt it.
class DpapiTokenStore : ITokenStore {
    private let path string
    private let entropy []uint8

    init(path string) {
        this.path = path
        this.entropy = Encoding.UTF8.GetBytes("Waikiki.Yoto.Tokens")
    }

    async func LoadAsync() TokenSet? {
        if !File.Exists(path) {
            return nil
        }
        let protectedBytes = await File.ReadAllBytesAsync(path)
        let bytes = ProtectedData.Unprotect(protectedBytes, entropy, DataProtectionScope.CurrentUser)
        return TokenSet.FromJson(Encoding.UTF8.GetString(bytes))
    }

    async func SaveAsync(tokens TokenSet) {
        let dir = Path.GetDirectoryName(path)
        if !string.IsNullOrEmpty(dir) {
            Directory.CreateDirectory(dir)
        }
        let protectedBytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(tokens.ToJson()), entropy, DataProtectionScope.CurrentUser)
        let temp = path + ".tmp"
        await File.WriteAllBytesAsync(temp, protectedBytes)
        File.Move(temp, path, true)
    }

    func ClearAsync() Task {
        if File.Exists(path) {
            File.Delete(path)
        }
        return Task.CompletedTask
    }
}
