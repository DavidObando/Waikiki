package Waikiki.Yoto

import System

/// Configuration for talking to Yoto. The client ID comes from a developer app registered at
/// https://dashboard.yoto.dev; it is not a secret for a public PKCE client, but is kept out of the repo.
class YotoOptions {
    init(clientId string) {
        ClientId = clientId
    }

    prop ClientId string {
        get;
        init;
    }

    var AuthBase string = "https://login.yotoplay.com"
    var ApiBase string = "https://api.yotoplay.com"
    var Audience string = "https://api.yotoplay.com"
    var Scope string = "openid profile offline_access user:content:manage user:icons:manage"

    /// Loopback redirect port; `http://127.0.0.1:<port>/callback` must be registered in the dashboard.
    var RedirectPort int32 = 8787

    /// Refresh this long before the access token expires.
    var RefreshSkew TimeSpan = TimeSpan.FromSeconds(60.0)

    /// How often to poll a transcode, and how long to wait in total.
    var PollInterval TimeSpan = TimeSpan.FromSeconds(2.0)
    var PollTimeout TimeSpan = TimeSpan.FromMinutes(30.0)

    /// Attempts for requests answered with HTTP 429, and the base delay when no Retry-After is given.
    var MaxRateLimitRetries int32 = 5
    var RateLimitBackoff TimeSpan = TimeSpan.FromSeconds(2.0)

    prop RedirectUri string -> "http://127.0.0.1:${RedirectPort}/callback"
}
