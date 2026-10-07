# Waikiki spec

Status: draft. See [YOTO_API.md](YOTO_API.md), [LICENSING.md](LICENSING.md), [ROADMAP.md](ROADMAP.md).

## 1. Goals and non-goals
Goals:
- Turn an unencrypted `.m4b` audiobook into a Yoto MYO card: chapters become tracks, the embedded cover becomes the card image.
- One Avalonia desktop app for Windows, macOS and Linux, written in G# on .NET 10.
- Talk to Yoto directly (no intermediary service).

Non-goals:
- No CLI.
- No Audible access, DRM or decryption. Use Oahu to produce the `.m4b` first.
- No Yoto device control or family-library scopes.
- Music playlists are not in v1. (Added later as M6; see below.)

## 2. User flow
1. Sign in to Yoto (browser, PKCE).
2. Choose an `.m4b`.
3. Preview detected chapters, title and cover. Edit titles, merge or split chapters, pick icons.
4. Upload with per-track progress and retry.
5. Card is created; link to open it in Yoto.

## 3. Architecture
Follows Oahu's conventions (G#, `.gsproj`, `Gsharp.NET.Sdk/<ver>`, net10.0, central package management, NBGV).

| Project | Role |
|---|---|
| `src/Waikiki.Mp4` | MIT, no dependencies. Read-only box parser; chapters (`chpl`, QuickTime chapter track, ID3 CHAP as found), cover (`covr`), tags; lossless splitter that writes standalone audio-only `.m4a` (valid `ftyp`/`moov`/`mdat`, correct `stts`/`stsc`/`stsz`/`stco`, faststart, no Audible-specific boxes, AAC config preserved). |
| `src/Waikiki.Yoto` | `HttpClient` wrapper: PKCE auth and refresh, upload, transcode polling, cover and icons, content create/update. |
| `src/Waikiki.Core` | Pipeline (import, plan, split, upload, publish), job state and progress, settings, token store. |
| `src/Waikiki.UI` | Avalonia views and view-models (CommunityToolkit.Mvvm, `x:CompileBindings`). |
| `src/Waikiki.App` | Exe host, hand-wired composition, `--smoke-test` flag. |
| `tests/*` | xunit: `Waikiki.Mp4.Tests`, `Waikiki.Yoto.Tests` (fake HTTP handler). |

Repo files: `Waikiki.slnx`, `Directory.Packages.props` (versions aligned with Oahu: Avalonia 11.2.7, CommunityToolkit.Mvvm 8.4.0), `version.json`.

## 4. M4B to tracks
- Chapter source precedence: determined during M1 from real files.
- Each output track must respect Yoto limits (about 60 min / 100 MB). Longer chapters are split further at frame boundaries; tiny chapters may be merged.
- Output is validated by re-parsing it with `Waikiki.Mp4`; in development also with ffprobe.
- Track format is lossless AAC `.m4a` (stream copy). MP3 only if M0 shows Yoto rejects AAC.
- Known risk: a whole `.m4b` renamed `.m4a` failed Yoto transcoding silently. Cause unknown until M0.

## 5. Yoto integration
Sequential: upload URL, PUT, poll for `transcodedSha256`, then `POST /content` referencing `yoto:#<sha>`. Cover and icons are separate uploads. Retries are idempotent by file SHA; 429 handled with backoff. Job state is persisted so an interrupted upload can resume.

## 5a. Music playlists (M6)
Choose a folder of audio files (mp3, m4a, aac, wav, flac, ogg, opus; one level, hidden files skipped). Each file becomes one chapter with one track and is uploaded untouched, since Yoto transcodes everything itself. Titles come from ID3/M4A tags or the file name (leading track numbers stripped); order is by disc and track number when every file has one, otherwise by natural file name, and can be changed in the review list. The card title is the shared album tag, else the folder name. The cover is embedded art, then a `cover`/`folder`/`front` image in the folder, then one the user picks. A card holds at most 100 tracks and about 100 MB per track (consumer guidance), enforced before upload. Re-running on the same folder updates the same card.

## 6. Auth and security
- PKCE with loopback redirect. The `client_id` is a public identifier, not a secret: Waikiki ships with a built-in app registration (`YotoClientIds.BuiltIn`), overridable by the Settings value or the `WAIKIKI_YOTO_CLIENT_ID` environment variable (in that order). If Yoto answers `invalid_client` / `unauthorized_client` (or "unknown client"), the app says the registration was rejected and opens Settings so the user can supply their own. Changing the client ID signs the user out, because tokens belong to a client.
- Scopes: `user:content:manage offline_access` (+ `user:icons:manage` if required).
- Refresh tokens are single-use: write atomically.
- Store tokens through `ITokenStore`: macOS Keychain, Windows DPAPI or the Linux Secret Service, falling back to a user-only file (Settings shows which is active). Never log tokens.

## 7. Packaging
Self-contained per-OS builds modelled on Oahu's `build/` scripts and workflow. macOS builds in CI are signed with a Developer ID certificate and notarized; Windows and Linux builds are unsigned.

## 8. Testing
Small generated `.m4b` fixtures (no copyrighted audio), parser and splitter unit tests, Yoto client tests with a fake handler, UI smoke test, manual end-to-end against a real account.

## 9. Risks and open questions
- Resolved in M0: the whole-`.m4b` upload failed because Yoto rejects files over its size and duration limits, so tracks are split per chapter.
- Writing a correct MP4 muxer is the biggest engineering risk; keep it audio-only and minimal.
- Yoto limits and several API details are unconfirmed (see [YOTO_API.md](YOTO_API.md)); rate limits unpublished.
- G# is pre-1.0; Avalonia plus CommunityToolkit works in Oahu, so risk is low.
- The built-in registration is unverified, so Yoto's consent screen shows a warning and the developer's email. Verification (yoto.dev/verify) is worth doing before promoting the app widely; verified apps have their scopes locked.
