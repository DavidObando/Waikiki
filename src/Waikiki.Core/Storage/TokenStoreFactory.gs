package Waikiki.Core.Storage

import System
import System.IO
import System.Threading
import System.Threading.Tasks
import Waikiki.Yoto

/// The chosen store and a human-readable description to show in Settings.
data class TokenStoreChoice {
    init(store ITokenStore, description string, isOsBacked bool) {
        Store = store
        Description = description
        IsOsBacked = isOsBacked
    }

    prop Store ITokenStore {
        get;
        init;
    }

    prop Description string {
        get;
        init;
    }

    /// False when the fallback file store is in use (tokens are only protected by file permissions).
    prop IsOsBacked bool {
        get;
        init;
    }
}

class TokenStoreFactory {
    shared {
        const ServiceName string = "Waikiki"
        const AccountName string = "yoto"

        /// Picks the best available store for this machine, falling back to a user-only file.
        async func CreateAsync(appDataDirectory string, runner ICommandRunner) TokenStoreChoice {
            if OperatingSystem.IsWindows() {
                return TokenStoreChoice(
                    DpapiTokenStore(Path.Combine(appDataDirectory, "tokens.dpapi")),
                    "Windows Data Protection (DPAPI), current user",
                    true
                )
            }
            if OperatingSystem.IsMacOS() && File.Exists(KeychainTokenStore.Tool) {
                return TokenStoreChoice(KeychainTokenStore(runner, ServiceName, AccountName), "macOS Keychain", true)
            }
            if OperatingSystem.IsLinux() && await SecretServiceAvailableAsync(runner) {
                return TokenStoreChoice(SecretToolTokenStore(runner, ServiceName, AccountName), "Secret Service (GNOME Keyring / KWallet)", true)
            }
            return TokenStoreChoice(
                FileTokenStore(Path.Combine(appDataDirectory, "tokens.json")),
                "File readable only by you (not encrypted; no OS secret store available)",
                false
            )
        }

        /// True when `secret-tool` exists and can talk to a running Secret Service.
        func SecretServiceAvailableAsync(runner ICommandRunner) Task[bool] {
            return ProbeSecretToolAsync(runner)
        }

        private async func ProbeSecretToolAsync(runner ICommandRunner) bool {
            try {
                let r = await runner.RunAsync(
                    SecretToolTokenStore.Tool,
                    []string{"lookup", "service", ServiceName + "-probe", "account", "probe"},
                    nil,
                    CancellationToken.None
                )
                // Not found = exit 1 with no output and no error text. Anything on stderr means no usable service.
                return r.Stdout.Trim().Length == 0 && r.Stderr.Trim().Length == 0
            } catch (e Exception) {
                return false
            }
        }
    }
}
