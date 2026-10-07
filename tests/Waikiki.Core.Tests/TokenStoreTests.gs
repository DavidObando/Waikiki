package Waikiki.Core.Tests

import System
import System.Text
import System.Threading.Tasks
import Waikiki.Core.Storage
import Waikiki.Yoto
import Xunit

class TokenStoreTests {
    shared {
        private func Tokens() TokenSet -> TokenSet("ACCESS-SECRET", "REFRESH-SECRET", DateTimeOffset.FromUnixTimeSeconds(1791428269))
    }

    @Fact
    async func Keychain_Save_Sends_Secret_On_Stdin_Never_In_Arguments() {
        let runner = FakeRunner()
        let store = KeychainTokenStore(runner, "Waikiki", "yoto")
        await store.SaveAsync(Tokens())
        let call = runner.Calls[0]
        Assert.Equal("/usr/bin/security", call.FileName)
        Assert.Equal([]string{"-i"}, call.Args)
        Assert.StartsWith("add-generic-password -U -a yoto -s Waikiki -w ", call.Stdin!!)
        Assert.EndsWith("\n", call.Stdin!!)
        for a in call.Args {
            Assert.DoesNotContain("SECRET", a)
        }
        // The stdin secret is base64 (no characters that need shell quoting) and decodes to our JSON.
        let secret = call.Stdin!!.Trim().Split(' ')[^1]
        Assert.Matches("^[A-Za-z0-9+/=]+$", secret)
        Assert.Contains("REFRESH-SECRET", Encoding.UTF8.GetString(Convert.FromBase64String(secret)))
    }

    @Fact
    async func Keychain_Round_Trips_Through_Find() {
        let runner = FakeRunner()
        let store = KeychainTokenStore(runner, "Waikiki", "yoto")
        let b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(Tokens().ToJson()))
        runner.Enqueue(0, b64 + "\n", "")
        let loaded = await store.LoadAsync()
        Assert.Equal("REFRESH-SECRET", loaded!!.RefreshToken)
        Assert.Equal([]string{"find-generic-password", "-a", "yoto", "-s", "Waikiki", "-w"}, runner.Calls[0].Args)
    }

    @Fact
    async func Keychain_Missing_Item_Is_Null_And_Other_Errors_Throw() {
        let runner = FakeRunner()
        let store = KeychainTokenStore(runner, "Waikiki", "yoto")
        runner.Enqueue(44, "", "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.")
        Assert.Null(await store.LoadAsync())
        runner.Enqueue(1, "", "boom")
        await Assert.ThrowsAsync[InvalidOperationException](() -> store.LoadAsync())
    }

    @Fact
    async func Keychain_Write_Errors_Are_Surfaced() {
        let runner = FakeRunner()
        let store = KeychainTokenStore(runner, "Waikiki", "yoto")
        runner.Enqueue(0, "", "security: SecKeychainItemCreateFromContent (<default>): User interaction is not allowed.")
        await Assert.ThrowsAsync[InvalidOperationException](() -> store.SaveAsync(Tokens()))
    }

    @Fact
    async func Keychain_Clear_Ignores_Not_Found() {
        let runner = FakeRunner()
        let store = KeychainTokenStore(runner, "Waikiki", "yoto")
        runner.Enqueue(44, "", "not found")
        await store.ClearAsync()
        Assert.Equal([]string{"delete-generic-password", "-a", "yoto", "-s", "Waikiki"}, runner.Calls[0].Args)
    }

    @Fact
    async func SecretTool_Save_Sends_Secret_On_Stdin_Never_In_Arguments() {
        let runner = FakeRunner()
        let store = SecretToolTokenStore(runner, "Waikiki", "yoto")
        await store.SaveAsync(Tokens())
        let call = runner.Calls[0]
        Assert.Equal("secret-tool", call.FileName)
        Assert.Equal("store", call.Args[0])
        Assert.Contains("service", call.Args)
        Assert.Contains("Waikiki", call.Args)
        for a in call.Args {
            Assert.DoesNotContain("SECRET", a)
        }
        Assert.Contains("REFRESH-SECRET", call.Stdin!!)
    }

    @Fact
    async func SecretTool_Lookup_Parses_Json_And_Treats_Empty_Exit_1_As_Missing() {
        let runner = FakeRunner()
        let store = SecretToolTokenStore(runner, "Waikiki", "yoto")
        runner.Enqueue(0, Tokens().ToJson(), "")
        let loaded = await store.LoadAsync()
        Assert.Equal("ACCESS-SECRET", loaded!!.AccessToken)
        runner.Enqueue(1, "", "")
        Assert.Null(await store.LoadAsync())
        runner.Enqueue(1, "", "secret-tool: Cannot autolaunch D-Bus without X11 $$DISPLAY")
        await Assert.ThrowsAsync[InvalidOperationException](() -> store.LoadAsync())
    }

    @Fact
    async func SecretService_Probe_Fails_Without_A_Usable_Service() {
        let ok = FakeRunner()
        ok.Enqueue(1, "", "")
        Assert.True(await TokenStoreFactory.SecretServiceAvailableAsync(ok))
        let noBus = FakeRunner()
        noBus.Enqueue(1, "", "Cannot autolaunch D-Bus without X11 $$DISPLAY")
        Assert.False(await TokenStoreFactory.SecretServiceAvailableAsync(noBus))
    }

    // Opt-in: round-trips a sentinel through the real OS store (macOS Keychain or Linux Secret Service)
    // under a throwaway service name, then deletes it. Set WAIKIKI_LIVE_SECRETS=1.
    @Fact
    async func Live_Os_Secret_Store_Round_Trip() {
        if Environment.GetEnvironmentVariable("WAIKIKI_LIVE_SECRETS") != "1" {
            return
        }
        let service = "Waikiki-test-" + Guid.NewGuid().ToString("N")
        var store ITokenStore? = nil
        if OperatingSystem.IsMacOS() {
            store = KeychainTokenStore(ProcessCommandRunner(), service, "yoto")
        } else if OperatingSystem.IsLinux() {
            store = SecretToolTokenStore(ProcessCommandRunner(), service, "yoto")
        }
        guard let s = store else {
            return
        }
        try {
            Assert.Null(await s.LoadAsync())
            let tokens = TokenSet("a\"b'c $$x `y` \\ é", "r-é-\"quoted\"", DateTimeOffset.FromUnixTimeSeconds(1791428269))
            await s.SaveAsync(tokens)
            let loaded = await s.LoadAsync()
            Assert.Equal(tokens.AccessToken, loaded!!.AccessToken)
            Assert.Equal(tokens.RefreshToken, loaded!!.RefreshToken)
            Assert.Equal(tokens.ExpiresAt, loaded!!.ExpiresAt)
            // Overwrite (upsert) works.
            await s.SaveAsync(TokenSet("second", "r2", tokens.ExpiresAt))
            Assert.Equal("second", (await s.LoadAsync())!!.AccessToken)
        } finally {
            await s.ClearAsync()
        }
        Assert.Null(await s.LoadAsync())
    }
}
