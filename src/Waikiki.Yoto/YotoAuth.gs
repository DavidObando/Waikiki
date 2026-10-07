package Waikiki.Yoto

import System
import System.Collections.Generic
import System.Net
import System.Net.Http
import System.Text
import System.Threading
import System.Threading.Tasks
import System.Text.Json.Nodes

/// OAuth 2.0 Authorization Code + PKCE against login.yotoplay.com, as a public client.
class YotoAuth {
    private let options YotoOptions
    private let http HttpClient
    private let store ITokenStore
    private let gate SemaphoreSlim = SemaphoreSlim(1, 1)

    init(options YotoOptions, http HttpClient, store ITokenStore) {
        this.options = options
        this.http = http
        this.store = store
    }

    func BuildAuthorizeUrl(challenge string, state string) string {
        let q = "audience=${Uri.EscapeDataString(options.Audience)}" +
            "&scope=${Uri.EscapeDataString(options.Scope)}" +
            "&response_type=code" +
            "&client_id=${Uri.EscapeDataString(options.ClientId)}" +
            "&redirect_uri=${Uri.EscapeDataString(options.RedirectUri)}" +
            "&code_challenge=${challenge}" +
            "&code_challenge_method=S256" +
            "&state=${state}"
        return "${options.AuthBase}/authorize?${q}"
    }

    /// Runs the browser sign-in: starts a loopback listener, asks the caller to open the URL, waits for the
    /// redirect, exchanges the code and stores the tokens.
    async func SignInAsync(openBrowser (string) -> void, cancellationToken CancellationToken) TokenSet {
        let verifier = Pkce.CreateVerifier()
        let state = Pkce.CreateState()
        let url = BuildAuthorizeUrl(Pkce.CreateChallenge(verifier), state)
        let listener = HttpListener()
        listener.Prefixes.Add("http://127.0.0.1:${options.RedirectPort}/")
        listener.Start()
        try {
            openBrowser(url)
            let pending = listener.GetContextAsync()
            let cancelled = Task.Delay(Timeout.Infinite, cancellationToken)
            let done = await Task.WhenAny(pending, cancelled)
            if done != pending {
                throw OperationCanceledException(cancellationToken)
            }
            let context = await pending
            let query = context.Request.QueryString
            let error = query["error"]
            let code = query["code"]
            let ok = error == nil && code != nil && query["state"] == state
            let page = if ok {
                "<html><body><h3>Signed in to Yoto. You can close this tab and return to Waikiki.</h3></body></html>"
            } else {
                "<html><body><h3>Sign-in failed. You can close this tab and try again in Waikiki.</h3></body></html>"
            }
            let bytes = Encoding.UTF8.GetBytes(page)
            context.Response.ContentType = "text/html; charset=utf-8"
            context.Response.ContentLength64 = int64(bytes.Length)
            await context.Response.OutputStream.WriteAsync(bytes, 0, bytes.Length)
            context.Response.Close()
            if error != nil {
                throw YotoAuthException("Yoto sign-in was rejected: ${error} ${query["error_description"]}")
            }
            if code == nil || query["state"] != state {
                throw YotoAuthException("Yoto sign-in returned an unexpected response (state mismatch).")
            }
            return await ExchangeCodeAsync(code!!, verifier, cancellationToken)
        } finally {
            listener.Close()
        }
    }

    async func ExchangeCodeAsync(code string, verifier string, cancellationToken CancellationToken) TokenSet {
        let form = "grant_type=authorization_code" +
            "&client_id=${Uri.EscapeDataString(options.ClientId)}" +
            "&code_verifier=${verifier}" +
            "&code=${Uri.EscapeDataString(code)}" +
            "&redirect_uri=${Uri.EscapeDataString(options.RedirectUri)}"
        let tokens = await PostTokenAsync(form, nil, cancellationToken)
        await store.SaveAsync(tokens)
        return tokens
    }

    /// Returns tokens that are valid for at least `RefreshSkew`, refreshing (and persisting the new,
    /// single-use refresh token) when needed. Throws YotoAuthException when no usable session exists.
    async func GetValidTokensAsync(cancellationToken CancellationToken) TokenSet {
        await gate.WaitAsync(cancellationToken)
        try {
            guard let current = await store.LoadAsync() else {
                throw YotoAuthException("Not signed in to Yoto.")
            }
            if !current.IsExpiring(DateTimeOffset.UtcNow, options.RefreshSkew) {
                return current
            }
            return await RefreshLockedAsync(current, cancellationToken)
        } finally {
            gate.Release()
        }
    }

    /// Forces a refresh, for example after the API answered 401.
    async func ForceRefreshAsync(cancellationToken CancellationToken) TokenSet {
        await gate.WaitAsync(cancellationToken)
        try {
            guard let current = await store.LoadAsync() else {
                throw YotoAuthException("Not signed in to Yoto.")
            }
            return await RefreshLockedAsync(current, cancellationToken)
        } finally {
            gate.Release()
        }
    }

    private async func RefreshLockedAsync(current TokenSet, cancellationToken CancellationToken) TokenSet {
        guard let refresh = current.RefreshToken else {
            throw YotoAuthException("The Yoto session expired and has no refresh token; sign in again.")
        }
        let form = "grant_type=refresh_token" +
            "&client_id=${Uri.EscapeDataString(options.ClientId)}" +
            "&refresh_token=${Uri.EscapeDataString(refresh)}"
        let tokens = await PostTokenAsync(form, refresh, cancellationToken)
        await store.SaveAsync(tokens)
        return tokens
    }

    private async func PostTokenAsync(form string, previousRefresh string?, cancellationToken CancellationToken) TokenSet {
        let request = HttpRequestMessage(HttpMethod.Post, "${options.AuthBase}/oauth/token")
        request.Content = StringContent(form, Encoding.UTF8, "application/x-www-form-urlencoded")
        let response = await http.SendAsync(request, cancellationToken)
        let body = await response.Content.ReadAsStringAsync(cancellationToken)
        if !response.IsSuccessStatusCode {
            if int32(response.StatusCode) == 400 || int32(response.StatusCode) == 401 || int32(response.StatusCode) == 403 {
                throw YotoAuthException("Yoto rejected the sign-in or refresh (${int32(response.StatusCode)}): ${body}")
            }
            throw YotoApiException(int32(response.StatusCode), body)
        }
        return TokenSet.FromOAuthResponse(body, DateTimeOffset.UtcNow, previousRefresh)
    }
}
