package Waikiki.Core

import System
import System.Collections.Generic
import System.Net.Http
import System.Threading
import System.Threading.Tasks
import Waikiki.Core.Storage
import Waikiki.Yoto

/// Owns the Yoto client for the app: created once the client ID is known, backed by the chosen token store.
class YotoSession {
    private let http HttpClient
    private var options YotoOptions? = nil
    private var auth YotoAuth? = nil
    private var client YotoClient? = nil
    private var publicIcons List[DisplayIcon]? = nil

    init(tokenStore TokenStoreChoice, http HttpClient) {
        TokenStore = tokenStore
        this.http = http
    }

    prop TokenStore TokenStoreChoice {
        get;
        init;
    }

    prop IsConfigured bool -> client != nil

    prop Client YotoClient {
        get -> client ?? throw InvalidOperationException("Set the Yoto client ID first.")
    }

    /// (Re)creates the client for the given client ID.
    func Configure(clientId string) {
        let o = YotoOptions(clientId.Trim())
        options = o
        let a = YotoAuth(o, http, TokenStore.Store)
        auth = a
        client = YotoClient(o, http, a)
        publicIcons = nil
    }

    async func HasSessionAsync() bool {
        return await TokenStore.Store.LoadAsync() != nil
    }

    async func SignInAsync(openBrowser (string) -> void, cancellationToken CancellationToken) {
        guard let a = auth else {
            throw InvalidOperationException("Set the Yoto client ID first.")
        }
        await a.SignInAsync(openBrowser, cancellationToken)
    }

    func SignOutAsync() Task -> TokenStore.Store.ClearAsync()

    /// Yoto's built-in icons, fetched once per configuration.
    async func GetPublicIconsAsync(cancellationToken CancellationToken) List[DisplayIcon] {
        if let cached = publicIcons {
            return cached
        }
        let icons = await Client.GetPublicIconsAsync(cancellationToken)
        publicIcons = icons
        return icons
    }
}
