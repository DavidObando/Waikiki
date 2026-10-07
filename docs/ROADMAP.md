# Roadmap

| Milestone | Outcome |
|---|---|
| **M0 Spike** (done) (gates the rest) | Split a real `.m4b` into per-chapter `.m4a` (ffmpeg is fine for the spike) and upload to Yoto. Learn why a whole `.m4b` renamed `.m4a` failed to transcode: limits (size/duration) vs file structure vs Oahu-written or Audible-specific boxes. Resolve the **[unconfirmed]** items in [YOTO_API.md](YOTO_API.md). Register a Yoto client ID. |
| **M1** (done) | `Waikiki.Mp4`: read-only parser for chapters, cover and tags, with tests. |
| **M2** (done) | Lossless chapter splitter writing standalone `.m4a` accepted by Yoto. MP3 fallback only if M0 demands it. |
| **M3** (done) | `Waikiki.Yoto`: PKCE auth, token storage, upload, transcode polling, cover/icons, content create/update. |
| **M4** (done) | Avalonia app, audiobook flow end to end. |
| **M5** | Per-OS packaging and CI. |
| **M6** | Music playlists (v2). |

## Status notes
- M0: results are in [YOTO_API.md](YOTO_API.md).
- M1: `Waikiki.Mp4` reads tags, cover, QuickTime/Nero chapters and sample tables. Verified on a real 9.6 h Audible-derived `.m4b` (20 chapters, times match ffprobe).
- M2: `ChapterSplitter` plans chapter-aligned segments (sub-splitting past 55 min / 90 MB) and writes standalone faststart `.m4a` with no re-encode. All 20 outputs for the real book decode cleanly in ffmpeg with no warnings, and Yoto transcodes our output (checked with one track). MP3 fallback was not needed.
- M3: `Waikiki.Yoto` has PKCE sign-in with a loopback listener, single-use refresh-token handling, 401-refresh and 429-backoff, upload with progress, transcode polling with failure and timeout detection, cover and icon upload, card create/update/delete/list. 21 unit tests use a fake HTTP handler, and an opt-in live test passed against the real API. Tokens are stored through `ITokenStore`; the shipped store is a user-only file (mode 600). An OS-keychain store is still to do (planned alongside the app in M4/M5).
- M4: `Waikiki.Core` has the headless pipeline (`AudiobookProject`, `UploadJob`): open, plan, split to a temp file, upload sequentially with weighted progress, cover, create/update card. State is saved after every step (`JobState`), so an interrupted run resumes and a rerun updates the same card instead of duplicating it. `Waikiki.App` is a single Avalonia window (sign in, choose book, edit titles/inclusion, upload, open card). Verified: 18 Core tests, a live macOS Keychain round trip, and a launch with a real book. A full GUI sign-in and upload has not been driven end to end yet.
- Token storage: `TokenStoreFactory` picks the macOS Keychain (`security -i`, secret on stdin), Windows DPAPI, or Linux Secret Service (`secret-tool`, secret on stdin), and falls back to a user-only file; Settings shows which one is active. The Windows and Linux stores are covered by unit tests with a fake command runner but have not been run on those platforms.
