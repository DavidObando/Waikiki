package Waikiki.Yoto

import System
import System.Security.Cryptography
import System.Text

/// PKCE (RFC 7636) helpers using the S256 method.
class Pkce {
    shared {
        func Base64Url(bytes []uint8) string {
            return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
        }

        func CreateVerifier() string -> Base64Url(RandomNumberGenerator.GetBytes(64))

        func CreateState() string -> Base64Url(RandomNumberGenerator.GetBytes(24))

        func CreateChallenge(verifier string) string {
            return Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)))
        }
    }
}
