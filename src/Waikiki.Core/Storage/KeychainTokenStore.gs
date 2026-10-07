package Waikiki.Core.Storage

import System
import System.Text
import System.Threading
import System.Threading.Tasks
import Waikiki.Yoto

/// Stores the token set as a generic password in the macOS login keychain through `/usr/bin/security`.
/// The secret is base64-encoded (no quoting issues) and written to `security -i` on stdin, so it never
/// appears in the argument list.
class KeychainTokenStore : ITokenStore {
    private let runner ICommandRunner
    private let service string
    private let account string

    init(runner ICommandRunner, service string, account string) {
        this.runner = runner
        this.service = service
        this.account = account
    }

    shared {
        const Tool string = "/usr/bin/security"
        // `security` exits with 44 when the item does not exist.
        const NotFoundExitCode int32 = 44
    }

    async func LoadAsync() TokenSet? {
        let r = await runner.RunAsync(Tool, []string{"find-generic-password", "-a", account, "-s", service, "-w"}, nil, CancellationToken.None)
        if r.ExitCode == NotFoundExitCode {
            return nil
        }
        if r.ExitCode != 0 {
            throw InvalidOperationException("Keychain read failed (${r.ExitCode}): ${r.Stderr.Trim()}")
        }
        let json = Encoding.UTF8.GetString(Convert.FromBase64String(r.Stdout.Trim()))
        return TokenSet.FromJson(json)
    }

    async func SaveAsync(tokens TokenSet) {
        let secret = Convert.ToBase64String(Encoding.UTF8.GetBytes(tokens.ToJson()))
        let command = "add-generic-password -U -a ${account} -s ${service} -w ${secret}\n"
        let r = await runner.RunAsync(Tool, []string{"-i"}, command, CancellationToken.None)
        if r.ExitCode != 0 || r.Stderr.Contains("security:") {
            throw InvalidOperationException("Keychain write failed (${r.ExitCode}): ${r.Stderr.Trim()}")
        }
    }

    async func ClearAsync() {
        let r = await runner.RunAsync(Tool, []string{"delete-generic-password", "-a", account, "-s", service}, nil, CancellationToken.None)
        if r.ExitCode != 0 && r.ExitCode != NotFoundExitCode {
            throw InvalidOperationException("Keychain delete failed (${r.ExitCode}): ${r.Stderr.Trim()}")
        }
    }
}
