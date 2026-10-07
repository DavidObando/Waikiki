package Waikiki.Core.Storage

import System
import System.Threading
import System.Threading.Tasks
import Waikiki.Yoto

/// Stores the token set in the freedesktop Secret Service (GNOME Keyring, KWallet) through `secret-tool`.
/// `secret-tool store` reads the secret from stdin, so it never appears in the argument list.
class SecretToolTokenStore : ITokenStore {
    private let runner ICommandRunner
    private let service string
    private let account string

    init(runner ICommandRunner, service string, account string) {
        this.runner = runner
        this.service = service
        this.account = account
    }

    shared {
        const Tool string = "secret-tool"
    }

    async func LoadAsync() TokenSet? {
        let r = await runner.RunAsync(Tool, []string{"lookup", "service", service, "account", account}, nil, CancellationToken.None)
        // An empty result with exit code 1 means "no such item".
        if r.Stdout.Trim().Length == 0 {
            if r.ExitCode == 0 || r.ExitCode == 1 && r.Stderr.Trim().Length == 0 {
                return nil
            }
            throw InvalidOperationException("Secret Service read failed (${r.ExitCode}): ${r.Stderr.Trim()}")
        }
        return TokenSet.FromJson(r.Stdout.Trim())
    }

    async func SaveAsync(tokens TokenSet) {
        let r = await runner.RunAsync(
            Tool,
            []string{"store", "--label=Waikiki (Yoto)", "service", service, "account", account},
            tokens.ToJson(),
            CancellationToken.None
        )
        if r.ExitCode != 0 {
            throw InvalidOperationException("Secret Service write failed (${r.ExitCode}): ${r.Stderr.Trim()}")
        }
    }

    async func ClearAsync() {
        let r = await runner.RunAsync(Tool, []string{"clear", "service", service, "account", account}, nil, CancellationToken.None)
        if r.ExitCode != 0 && r.Stderr.Trim().Length > 0 {
            throw InvalidOperationException("Secret Service delete failed (${r.ExitCode}): ${r.Stderr.Trim()}")
        }
    }
}
