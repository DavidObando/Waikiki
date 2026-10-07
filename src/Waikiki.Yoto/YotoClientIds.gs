package Waikiki.Yoto

import System

/// Where the effective client ID came from.
enum ClientIdSource {
    BuiltIn,
    Environment,
    Settings
}

data class ResolvedClientId {
    init(clientId string, source ClientIdSource) {
        ClientId = clientId
        Source = source
    }

    prop ClientId string {
        get;
        init;
    }

    prop Source ClientIdSource {
        get;
        init;
    }
}

/// The Yoto app registration Waikiki ships with. A client ID for a public (PKCE) client is not a secret:
/// it appears in the sign-in URL and in the binary of every OAuth desktop app. Forks and self-builds can
/// register their own app at https://dashboard.yoto.dev and override it.
class YotoClientIds {
    shared {
        const BuiltIn string = "tpc_mouw9YowsMTrX9CqUNjJDx"
        const EnvironmentVariable string = "WAIKIKI_YOTO_CLIENT_ID"

        /// Settings value first (an explicit choice in the app), then the environment variable, then the built-in ID.
        func Resolve(settingsValue string?, environmentValue string?) ResolvedClientId {
            if !string.IsNullOrWhiteSpace(settingsValue) {
                return ResolvedClientId(settingsValue!!.Trim(), ClientIdSource.Settings)
            }
            if !string.IsNullOrWhiteSpace(environmentValue) {
                return ResolvedClientId(environmentValue!!.Trim(), ClientIdSource.Environment)
            }
            return ResolvedClientId(BuiltIn, ClientIdSource.BuiltIn)
        }
    }
}
