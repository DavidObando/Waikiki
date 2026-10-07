package Waikiki.Yoto

import System
import System.Globalization
import System.Text.Json.Nodes

/// OAuth tokens. Yoto refresh tokens are single-use: always store the newest set.
data class TokenSet {
    init(accessToken string, refreshToken string?, expiresAt DateTimeOffset) {
        AccessToken = accessToken
        RefreshToken = refreshToken
        ExpiresAt = expiresAt
    }

    prop AccessToken string {
        get;
        init;
    }

    prop RefreshToken string? {
        get;
        init;
    }

    prop ExpiresAt DateTimeOffset {
        get;
        init;
    }

    func IsExpiring(now DateTimeOffset, skew TimeSpan) bool -> now + skew >= ExpiresAt

    func ToJson() string {
        let o = JsonObject()
        o["access_token"] = AccessToken
        o["refresh_token"] = RefreshToken
        o["expires_at"] = ExpiresAt.ToUnixTimeSeconds()
        return o.ToJsonString()
    }

    shared {
        func FromJson(json string) TokenSet {
            guard let node = JsonNode.Parse(json) else {
                throw FormatException("Token JSON is empty.")
            }
            let access = node["access_token"]?.ToString() ?? throw FormatException("access_token is missing.")
            let refresh = node["refresh_token"]?.ToString()
            let exp = int64.Parse(node["expires_at"]?.ToString() ?? "0", CultureInfo.InvariantCulture)
            return TokenSet(access, refresh, DateTimeOffset.FromUnixTimeSeconds(exp))
        }

        /// Parses an OAuth token endpoint response. If it carries no refresh token, `previousRefresh` is kept.
        func FromOAuthResponse(json string, now DateTimeOffset, previousRefresh string?) TokenSet {
            guard let node = JsonNode.Parse(json) else {
                throw FormatException("Token response is empty.")
            }
            let access = node["access_token"]?.ToString() ?? throw FormatException("access_token is missing from the token response.")
            let refresh = node["refresh_token"]?.ToString() ?? previousRefresh
            var expiresIn float64 = 3600.0
            if let e = node["expires_in"] {
                expiresIn = float64.Parse(e.ToString(), CultureInfo.InvariantCulture)
            }
            return TokenSet(access, refresh, now + TimeSpan.FromSeconds(expiresIn))
        }
    }
}
