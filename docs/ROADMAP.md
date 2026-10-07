# Roadmap

| Milestone | Outcome |
|---|---|
| **M0 Spike** (done) (gates the rest) | Split a real `.m4b` into per-chapter `.m4a` (ffmpeg is fine for the spike) and upload to Yoto. Learn why a whole `.m4b` renamed `.m4a` failed to transcode: limits (size/duration) vs file structure vs Oahu-written or Audible-specific boxes. Resolve the **[unconfirmed]** items in [YOTO_API.md](YOTO_API.md). Register a Yoto client ID. |
| **M1** (done) | `Waikiki.Mp4`: read-only parser for chapters, cover and tags, with tests. |
| **M2** (done) | Lossless chapter splitter writing standalone `.m4a` accepted by Yoto. MP3 fallback only if M0 demands it. |
| **M3** | `Waikiki.Yoto`: PKCE auth, token storage, upload, transcode polling, cover/icons, content create/update. |
| **M4** | Avalonia app, audiobook flow end to end. |
| **M5** | Per-OS packaging and CI. |
| **M6** | Music playlists (v2). |

## Status notes
- M0: results are in [YOTO_API.md](YOTO_API.md).
- M1: `Waikiki.Mp4` reads tags, cover, QuickTime/Nero chapters and sample tables. Verified on a real 9.6 h Audible-derived `.m4b` (20 chapters, times match ffprobe).
- M2: `ChapterSplitter` plans chapter-aligned segments (sub-splitting past 55 min / 90 MB) and writes standalone faststart `.m4a` with no re-encode. All 20 outputs for the real book decode cleanly in ffmpeg with no warnings, and Yoto transcodes our output (checked with one track). MP3 fallback was not needed.
