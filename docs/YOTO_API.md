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
