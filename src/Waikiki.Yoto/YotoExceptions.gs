package Waikiki.Yoto

import System

/// The Yoto API answered with a non-success status.
class YotoApiException : Exception {
    init(statusCode int32, body string) : base("Yoto API returned HTTP ${statusCode}: ${body}") {
        StatusCode = statusCode
        Body = body
    }

    prop StatusCode int32 {
        get;
        init;
    }

    prop Body string {
        get;
        init;
    }
}

/// Sign-in failed or the stored session can no longer be refreshed; the user must sign in again.
class YotoAuthException : Exception {
    init(message string) : base(message) {
    }

    init(message string, errorCode string?, errorDescription string?) : base(message) {
        ErrorCode = errorCode
        ErrorDescription = errorDescription
    }

    /// The OAuth `error` value, when Yoto returned one.
    prop ErrorCode string? {
        get;
        init;
    }

    prop ErrorDescription string? {
        get;
        init;
    }

    /// True when Yoto indicates the client ID itself is unknown, disabled or revoked, as opposed to a
    /// problem with this particular sign-in or session.
    prop IsClientRejected bool {
        get {
            if ErrorCode == "invalid_client" || ErrorCode == "unauthorized_client" {
                return true
            }
            if let d = ErrorDescription {
                return d.Contains("unknown client", StringComparison.OrdinalIgnoreCase)
            }
            return false
        }
    }
}

/// Yoto accepted an upload but could not transcode it (for example a file over its size or duration limits).
/// Yoto reports this only through fields in the status body while still answering HTTP 202.
class YotoTranscodeException : Exception {
    init(uploadId string, body string) : base("Yoto could not transcode upload ${uploadId}: ${body}") {
        UploadId = uploadId
    }

    prop UploadId string {
        get;
        init;
    }
}
