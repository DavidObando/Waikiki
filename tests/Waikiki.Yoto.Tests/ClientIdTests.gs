package Waikiki.Yoto.Tests

import System
import System.Net.Http
import System.Threading
import Waikiki.TestSupport
import Waikiki.Yoto
import Xunit

class ClientIdTests {
    shared {
        private async func RefreshFailsWith(status int32, body string) YotoAuthException {
            let handler = FakeHandler()
            handler.Enqueue(status, body)
            let store = MemoryTokenStore()
            await store.SaveAsync(TokenSet("old", "refresh", DateTimeOffset.UtcNow.AddMinutes(-5.0)))
            let auth = YotoAuth(YotoOptions("c"), HttpClient(handler), store)
            return await Assert.ThrowsAsync[YotoAuthException](() -> auth.GetValidTokensAsync(CancellationToken.None))
        }
    }

    @Fact
    func Built_In_Client_Id_Is_Used_By_Default() {
        let r = YotoClientIds.Resolve(nil, nil)
        Assert.Equal(YotoClientIds.BuiltIn, r.ClientId)
        Assert.Equal(ClientIdSource.BuiltIn, r.Source)
        Assert.StartsWith("tpc_", YotoClientIds.BuiltIn)
        // Blank values do not count as overrides.
        Assert.Equal(ClientIdSource.BuiltIn, YotoClientIds.Resolve("  ", "").Source)
    }

    @Fact
    func Settings_Beat_Environment_Which_Beats_Built_In() {
        let env = YotoClientIds.Resolve(nil, " env-id ")
        Assert.Equal("env-id", env.ClientId)
        Assert.Equal(ClientIdSource.Environment, env.Source)
        let both = YotoClientIds.Resolve("settings-id", "env-id")
        Assert.Equal("settings-id", both.ClientId)
        Assert.Equal(ClientIdSource.Settings, both.Source)
    }

    @Fact
    async func Invalid_Client_From_The_Token_Endpoint_Is_Reported_As_Client_Rejected() {
        let ex = await RefreshFailsWith(401, "{\"error\":\"invalid_client\",\"error_description\":\"Unknown client: abc\"}")
        Assert.True(ex.IsClientRejected)
        Assert.Equal("invalid_client", ex.ErrorCode)
    }

    @Fact
    async func Unauthorized_Client_Is_Reported_As_Client_Rejected() {
        let ex = await RefreshFailsWith(400, "{\"error\":\"unauthorized_client\"}")
        Assert.True(ex.IsClientRejected)
    }

    @Fact
    async func Unknown_Client_Description_Alone_Is_Enough() {
        let ex = await RefreshFailsWith(403, "{\"error\":\"access_denied\",\"error_description\":\"Unknown Client\"}")
        Assert.True(ex.IsClientRejected)
    }

    @Fact
    async func Expired_Refresh_Token_Is_Not_A_Client_Problem() {
        let ex = await RefreshFailsWith(403, "{\"error\":\"invalid_grant\",\"error_description\":\"Unknown or invalid refresh token.\"}")
        Assert.False(ex.IsClientRejected)
        Assert.Equal("invalid_grant", ex.ErrorCode)
    }

    @Fact
    async func Non_Json_Error_Body_Is_Handled() {
        let ex = await RefreshFailsWith(401, "<html>nope</html>")
        Assert.False(ex.IsClientRejected)
        Assert.Null(ex.ErrorCode)
        Assert.Contains("nope", ex.Message)
    }
}
