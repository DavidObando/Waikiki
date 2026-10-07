package Waikiki.Yoto

import System
import System.Collections.Generic
import System.Globalization
import System.IO
import System.Net.Http
import System.Net.Http.Headers
import System.Text
import System.Text.Json.Nodes
import System.Threading
import System.Threading.Tasks

data class ApiResponse {
    init(statusCode int32, body string) {
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

    prop IsSuccess bool -> StatusCode >= 200 && StatusCode < 300
}

/// Thin client for the Yoto MYO content API: upload and transcode audio, cover and icons, create cards.
/// Requests carry the bearer token, refresh once on 401 and back off on 429.
class YotoClient {
    private let options YotoOptions
    private let http HttpClient
    private let auth YotoAuth

    init(options YotoOptions, http HttpClient, auth YotoAuth) {
        this.options = options
        this.http = http
        this.auth = auth
    }

    /// Uploads an audio stream, waits for Yoto to transcode it, and returns the transcoded track reference.
    /// `progress` reports cumulative bytes sent.
    async func UploadAudioAsync(
        source Stream,
        contentType string,
        progress IProgress[int64]?,
        cancellationToken CancellationToken
    ) AudioUpload {
        let urlResponse = await SendApiAsync(HttpMethod.Get, "/media/transcode/audio/uploadUrl", nil, cancellationToken)
        EnsureSuccess(urlResponse)
        let upload = JsonHelpers.Child(JsonNode.Parse(urlResponse.Body), "upload")
        let uploadUrl = JsonHelpers.Str(upload, "uploadUrl") ?? throw YotoApiException(urlResponse.StatusCode, urlResponse.Body)
        let uploadId = JsonHelpers.Str(upload, "uploadId") ?? throw YotoApiException(urlResponse.StatusCode, urlResponse.Body)

        // The presigned URL carries its own authorization: do not add the bearer token.
        let put = HttpRequestMessage(HttpMethod.Put, uploadUrl)
        let content = StreamContent(ProgressStream(source, progress))
        content.Headers.ContentType = MediaTypeHeaderValue(contentType)
        put.Content = content
        let putResponse = await http.SendAsync(put, cancellationToken)
        if !putResponse.IsSuccessStatusCode {
            throw YotoApiException(int32(putResponse.StatusCode), await putResponse.Content.ReadAsStringAsync(cancellationToken))
        }
        return await WaitForTranscodeAsync(uploadId, cancellationToken)
    }

    async func UploadAudioFileAsync(
        path string,
        contentType string,
        progress IProgress[int64]?,
        cancellationToken CancellationToken
    ) AudioUpload {
        using let stream = FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)
        return await UploadAudioAsync(stream, contentType, progress, cancellationToken)
    }

    /// Polls until Yoto reports a transcoded SHA-256. Yoto answers HTTP 202 forever for uploads it
    /// rejects (for example whole audiobooks over its limits) and only sets `failedUploadSha256`, so that
    /// field is treated as failure.
    async func WaitForTranscodeAsync(uploadId string, cancellationToken CancellationToken) AudioUpload {
        let started = DateTime.UtcNow
        while true {
            let response = await SendApiAsync(
                HttpMethod.Get,
                "/media/upload/${Uri.EscapeDataString(uploadId)}/transcoded?loudnorm=false",
                nil,
                cancellationToken
            )
            if response.StatusCode >= 400 && response.StatusCode != 404 {
                throw YotoApiException(response.StatusCode, response.Body)
            }
            if response.IsSuccess {
                let transcode = JsonHelpers.Child(JsonNode.Parse(response.Body), "transcode")
                if JsonHelpers.Str(transcode, "failedUploadSha256") != nil {
                    throw YotoTranscodeException(uploadId, response.Body)
                }
                if let sha = JsonHelpers.Str(transcode, "transcodedSha256") {
                    let info = JsonHelpers.Child(transcode, "transcodedInfo")
                    return AudioUpload(
                        uploadId,
                        sha,
                        TimeSpan.FromSeconds(JsonHelpers.Num(info, "duration")),
                        int64(JsonHelpers.Num(info, "fileSize")),
                        JsonHelpers.Str(info, "codec") ?? "",
                        JsonHelpers.Str(info, "channels") ?? "stereo"
                    )
                }
            }
            if DateTime.UtcNow - started > options.PollTimeout {
                throw TimeoutException("Timed out waiting for Yoto to transcode upload ${uploadId}.")
            }
            await Task.Delay(options.PollInterval, cancellationToken)
        }
    }

    async func UploadCoverAsync(image []uint8, contentType string, cancellationToken CancellationToken) CoverImage {
        let response = await SendApiAsync(
            HttpMethod.Post,
            "/media/coverImage/user/me/upload?autoconvert=true",
            () -> RawContent(image, contentType),
            cancellationToken
        )
        EnsureSuccess(response)
        let cover = JsonHelpers.Child(JsonNode.Parse(response.Body), "coverImage")
        return CoverImage(
            JsonHelpers.Str(cover, "mediaId") ?? throw YotoApiException(response.StatusCode, response.Body),
            JsonHelpers.Str(cover, "mediaUrl") ?? throw YotoApiException(response.StatusCode, response.Body)
        )
    }

    /// Yoto's built-in icon library.
    async func GetPublicIconsAsync(cancellationToken CancellationToken) List[DisplayIcon] {
        let response = await SendApiAsync(HttpMethod.Get, "/media/displayIcons/user/yoto", nil, cancellationToken)
        EnsureSuccess(response)
        return ParseIcons(response.Body)
    }

    /// Uploads a custom icon (PNG or GIF) as a raw request body; Yoto resizes it to 16x16. Returns its media ID.
    async func UploadIconAsync(image []uint8, contentType string, fileName string, cancellationToken CancellationToken) string {
        let response = await SendApiAsync(
            HttpMethod.Post,
            "/media/displayIcons/user/me/upload?autoConvert=true&filename=${Uri.EscapeDataString(fileName)}",
            () -> RawContent(image, contentType),
            cancellationToken
        )
        EnsureSuccess(response)
        let root = JsonNode.Parse(response.Body)
        let icon = JsonHelpers.Child(root, "displayIcon")
        return JsonHelpers.Str(icon, "mediaId") ?? JsonHelpers.Str(root, "mediaId") ?? throw YotoApiException(response.StatusCode, response.Body)
    }

    /// Creates a card, or updates it when `request.CardId` is set. Returns the card ID.
    async func CreateOrUpdateCardAsync(request CardRequest, cancellationToken CancellationToken) string {
        let json = BuildCardJson(request).ToJsonString()
        let response = await SendApiAsync(
            HttpMethod.Post,
            "/content",
            () -> StringContent(json, Encoding.UTF8, "application/json"),
            cancellationToken
        )
        EnsureSuccess(response)
        let card = JsonHelpers.Child(JsonNode.Parse(response.Body), "card")
        return JsonHelpers.Str(card, "cardId") ?? request.CardId ?? throw YotoApiException(response.StatusCode, response.Body)
    }

    async func DeleteCardAsync(cardId string, cancellationToken CancellationToken) {
        let response = await SendApiAsync(HttpMethod.Delete, "/content/${Uri.EscapeDataString(cardId)}", nil, cancellationToken)
        EnsureSuccess(response)
    }

    async func GetMyCardsAsync(cancellationToken CancellationToken) List[CardSummary] {
        let response = await SendApiAsync(HttpMethod.Get, "/content/mine", nil, cancellationToken)
        EnsureSuccess(response)
        let result = List[CardSummary]()
        if let cards = JsonHelpers.Child(JsonNode.Parse(response.Body), "cards") {
            for c in cards.AsArray() {
                result.Add(CardSummary(JsonHelpers.Str(c, "cardId") ?? "", JsonHelpers.Str(c, "title") ?? ""))
            }
        }
        return result
    }

    shared {
        func BuildCardJson(request CardRequest) JsonObject {
            var totalSeconds float64 = 0.0
            var totalBytes int64 = 0
            let chapters = JsonArray()
            var chapterNumber int32 = 0
            for chapter in request.Chapters {
                chapterNumber++
                let key = chapterNumber.ToString("D2", CultureInfo.InvariantCulture)
                let tracks = JsonArray()
                var trackNumber int32 = 0
                for track in chapter.Tracks {
                    trackNumber++
                    let tkey = trackNumber.ToString("D2", CultureInfo.InvariantCulture)
                    let t = JsonObject()
                    t["key"] = tkey
                    t["title"] = track.Title
                    t["type"] = "audio"
                    t["trackUrl"] = "yoto:#${track.Upload.Sha256}"
                    t["duration"] = Math.Round(track.Upload.Duration.TotalSeconds)
                    t["fileSize"] = track.Upload.FileSize
                    t["channels"] = track.Upload.Channels
                    t["format"] = track.Upload.Codec
                    if let icon = track.IconMediaId ?? chapter.IconMediaId {
                        t["display"] = IconDisplay(icon)
                    }
                    tracks.Add(t)
                    totalSeconds = totalSeconds + track.Upload.Duration.TotalSeconds
                    totalBytes = totalBytes + track.Upload.FileSize
                }
                let ch = JsonObject()
                ch["key"] = key
                ch["title"] = chapter.Title
                ch["overlayLabel"] = chapterNumber.ToString(CultureInfo.InvariantCulture)
                if let icon = chapter.IconMediaId {
                    ch["display"] = IconDisplay(icon)
                }
                ch["tracks"] = tracks
                chapters.Add(ch)
            }
            let content = JsonObject()
            content["chapters"] = chapters
            let media = JsonObject()
            media["duration"] = Math.Round(totalSeconds)
            media["fileSize"] = totalBytes
            let metadata = JsonObject()
            if let cover = request.CoverUrl {
                let c = JsonObject()
                c["imageL"] = cover
                metadata["cover"] = c
            }
            metadata["media"] = media
            let root = JsonObject()
            if let id = request.CardId {
                root["cardId"] = id
            }
            root["title"] = request.Title
            root["content"] = content
            root["metadata"] = metadata
            return root
        }

        func ParseIcons(body string) List[DisplayIcon] {
            let result = List[DisplayIcon]()
            if let icons = JsonHelpers.Child(JsonNode.Parse(body), "displayIcons") {
                for i in icons.AsArray() {
                    let tags = List[string]()
                    if let publicTags = JsonHelpers.Child(i, "publicTags") {
                        for tag in publicTags.AsArray() {
                            tags.Add(tag.ToString())
                        }
                    }
                    result.Add(DisplayIcon(JsonHelpers.Str(i, "mediaId") ?? "", JsonHelpers.Str(i, "title") ?? "", tags))
                }
            }
            return result
        }

        private func IconDisplay(mediaId string) JsonObject {
            let d = JsonObject()
            d["icon16x16"] = "yoto:#${mediaId}"
            return d
        }

        private func RawContent(bytes []uint8, contentType string) HttpContent {
            let content = ByteArrayContent(bytes)
            content.Headers.ContentType = MediaTypeHeaderValue(contentType)
            return content
        }

        private func EnsureSuccess(response ApiResponse) {
            if !response.IsSuccess {
                throw YotoApiException(response.StatusCode, response.Body)
            }
        }
    }

    private async func SendApiAsync(
        method HttpMethod,
        path string,
        contentFactory (() -> HttpContent)?,
        cancellationToken CancellationToken
    ) ApiResponse {
        var refreshedAfter401 = false
        var attempt int32 = 0
        while true {
            let tokens = await auth.GetValidTokensAsync(cancellationToken)
            let request = HttpRequestMessage(method, "${options.ApiBase}${path}")
            request.Headers.Authorization = AuthenticationHeaderValue("Bearer", tokens.AccessToken)
            if let factory = contentFactory {
                request.Content = factory()
            }
            let response = await http.SendAsync(request, cancellationToken)
            let status = int32(response.StatusCode)
            let body = await response.Content.ReadAsStringAsync(cancellationToken)
            if status == 401 && !refreshedAfter401 {
                refreshedAfter401 = true
                await auth.ForceRefreshAsync(cancellationToken)
                continue
            }
            if status == 429 && attempt < options.MaxRateLimitRetries {
                var delay = TimeSpan.FromSeconds(options.RateLimitBackoff.TotalSeconds * Math.Pow(2.0, float64(attempt)))
                if let retryAfter = response.Headers.RetryAfter {
                    if let d = retryAfter.Delta {
                        delay = d
                    }
                }
                attempt++
                await Task.Delay(delay, cancellationToken)
                continue
            }
            return ApiResponse(status, body)
        }
    }
}
