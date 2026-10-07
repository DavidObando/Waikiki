# Yoto API surface

Sources are third-party summaries unless noted. Items marked **[unconfirmed]** must be resolved in the M0 spike (see [ROADMAP.md](ROADMAP.md)). Docs: <https://yoto.dev>.

- API base: `https://api.yotoplay.com`
- Auth base: `https://login.yotoplay.com` (`/authorize`, `/oauth/token`)
- No official OpenAPI spec or .NET SDK was found. The official SDK is TypeScript (`@yotoplay/yoto-sdk`). Waikiki uses a thin `HttpClient` wrapper.

## Authentication
- Authorization Code + PKCE (S256), public client, loopback redirect (docs example: `http://127.0.0.1:8787/callback`, registered exactly in the dashboard). See <https://yoto.dev/authentication/headless-cli-auth/>.
- Authorize parameters: `audience=https://api.yotoplay.com`, `response_type=code`, `client_id`, `scope`, `code_challenge`, `code_challenge_method=S256`, `redirect_uri`. **[unconfirmed: exact list]**
- Device-code flow is deprecated. Do not use it.
- Client registration: <https://dashboard.yoto.dev>. Requested scopes must be enabled there or login fails with `access_denied`.
- Scopes (<https://yoto.dev/authentication/scopes/>): `user:content:manage`, `offline_access`; `user:icons:manage` **[unconfirmed]**. Do not request `family:devices:*`, which blocks verified-app status.
- Access tokens are JWTs; refresh ahead of `exp` (about 30 s buffer). Lifetime **[unconfirmed]**.
- Refresh tokens are single-use: persist the new one after each refresh.

## Upload flow (<https://yoto.dev/myo/uploading-to-cards/>)
1. `GET /media/transcode/audio/uploadUrl` returns `{ upload: { uploadUrl, uploadId } }`.
2. `PUT {uploadUrl}` with raw bytes and a matching `Content-Type` (`audio/mpeg`, or the AAC/M4A type).
3. Poll `GET /media/upload/{uploadId}/transcoded?loudnorm=false` until `transcode.transcodedSha256` exists. The response has `transcodedInfo { duration (ms), fileSize, channels, format, metadata.title }`. Poll interval and timeout need to be generous for long tracks. A silent failure here is what the user saw with a whole `.m4b`: inspect the full response body. **[unconfirmed: failure shape]**
4. `POST /content` creates a card (no `cardId`) or updates one (with `cardId`).

## Content JSON (shape to be verified)
```json
{ "title": "...",
  "content": { "chapters": [ {
    "key": "01", "title": "...", "overlayLabel": "1",
    "display": { "icon16x16": "yoto:#<iconId>" },
    "tracks": [ {
      "key": "01", "title": "...", "type": "audio",
      "trackUrl": "yoto:#<transcodedSha256>",
      "duration": 123000, "fileSize": 1234567, "channels": 2, "format": "aac",
      "display": { "icon16x16": "yoto:#<iconId>" } } ] } ] },
  "metadata": { "cover": { "imageL": "<mediaUrl>" },
                "media": { "duration": 0, "fileSize": 0 } } }
```
**[unconfirmed]**: whether `metadata.media` totals are required, where `cardId` goes, icon id forms (`yoto:#` vs `yotoicon:`).

## Images
- Cover: `POST /media/coverImage/user/me/upload?autoconvert=true`, raw image body. Returns `coverImage { mediaId, mediaUrl }`. Target dimensions **[unconfirmed]**.
- Custom icons: `POST /media/displayIcons/user/me/upload?autoConvert=true&filename=...`, PNG/GIF, resized to 16x16. Raw binary body with `Content-Type: image/png`; multipart reportedly returns 400. **[unconfirmed]**
- Public/default icons: `getPublicIcons` endpoint. **[unconfirmed: path, shape]**

## Limits (consumer guidance, not official) **[unconfirmed]**
- Up to 100 tracks per card, 100 MB and 60 minutes per track, about 500 MB per card.
- MP3 and AAC/M4A accepted; Yoto transcodes server-side.
- Rate limits unpublished. Upload sequentially, back off on 429.

## Spike results (M0, 2026-10-07, real account)
Confirmed:
- PKCE login with loopback `http://127.0.0.1:8787/callback` works. Scope string `openid profile offline_access user:content:manage user:icons:manage` was accepted. Access token lifetime is 8 h (28800 s).
- Per-chapter AAC `.m4a` (ffmpeg `-c copy -map 0:a -map_metadata -1`, 1 MB to 36 MB, up to 38 min) uploads and transcodes fine. Content-Type `audio/mp4`. Yoto re-encodes to Opus 64k ogg and applies loudnorm even with `loudnorm=false` in the poll URL (the option is on the upload; `loudnorm=false` did not disable it). `transcodedInfo.duration` is in **seconds**, not ms. Transcode took about 50 s for a 17 MB, 17 min track.
- Success: poll returns 200 with `transcode.transcodedSha256`; in progress: 202.
- Cover: `POST /media/coverImage/user/me/upload?autoconvert=true`, raw JPEG body (600x600 accepted), returns `coverImage.mediaUrl`.
- Public icons: `GET /media/displayIcons/user/yoto` returns `displayIcons[]` with `mediaId`, `title`, `publicTags`. `yoto:#<mediaId>` works as `icon16x16`.
- `POST /content` with the JSON shape above succeeded; response has `card.cardId` and `_id`. `metadata.media` totals were sent, so whether they are required is still untested.
- `GET /content/mine` lists the user's cards.

Why the whole `.m4b` failed:
- A 9.6 h, 550 MB `.m4b` (renamed `.m4a`) never starts transcoding. Polling returns 202 forever, but the body has `failedUploadSha256` set, `startedAt: null`, `progress: null`. The client must treat that as failure. Most likely cause is the size/duration limit, not the file structure; not isolated further.
- The original `.m4b` structure is sound: audio track 1 has `tref/chap` pointing at track 2, which is a QuickTime text chapter track. ffmpeg `-c copy -map 0:a` leaves the `tref/chap` box in the output `.m4a` while dropping the text track, so the splits carry a dangling reference ("Referenced QT chapter track not found"). Yoto accepted them anyway, but `Waikiki.Mp4` must not write `tref` into split outputs.

Still unconfirmed: whether `metadata.media` is required, icon upload raw vs multipart, exact per-track/per-card limits, opus `duration`/`fileSize` values to put in the card (we used `transcodedInfo`).

## M3 live verification (2026-10-07, `Waikiki.Yoto` against the real API)
Confirmed with the opt-in `LiveTests`:
- Custom icon upload as a raw PNG body (`Content-Type: image/png`, `?autoConvert=true&filename=...`) works; the response carries the new icon's media ID, usable as `yoto:#<mediaId>`. Multipart was not tried.
- Updating a card: `POST /content` with a top-level `cardId` updates it in place (title change confirmed via `GET /content/mine`).
- Deleting a card: `DELETE /content/{cardId}`.
- The public icon library has 516 icons (`GET /media/displayIcons/user/yoto`).
- Uploading identical audio twice returns the same `transcodedSha256`, so uploads are idempotent by content.
- The upload PUT sends a `Content-Length` and no bearer token (the presigned URL authorizes it); progress is reported as bytes sent.
- Failure detection: a transcode is failed when `transcode.failedUploadSha256` is set, even though the HTTP status stays 202.

Still untested: whether `metadata.media` is required on `POST /content` (we always send it), exact per-track/per-card limits, and the behavior of multipart icon uploads.

## Audio formats (M6 spike, 2026-10-07)
Uploading 4-second test tones with `PUT {uploadUrl}` and the content type below, Yoto transcoded all of these (to Opus) with the right duration, so music files can be uploaded untouched:

| Extension | Content-Type sent | Result |
|---|---|---|
| `.mp3` | `audio/mpeg` | OK |
| `.m4a` | `audio/mp4` | OK |
| `.aac` (ADTS) | `audio/aac` | OK |
| `.wav` | `audio/wav` | OK |
| `.flac` | `audio/flac` | OK |
| `.opus` | `audio/ogg` | OK |

Yoto does not document these formats; they are empirical. Ogg Vorbis (`.ogg`) is accepted by Waikiki on the assumption that Yoto's decoder handles it, but was not tested (the local ffmpeg has no Vorbis encoder). A live run with a four-track MP3 folder (tags, embedded cover) created, listed and deleted a card successfully.
