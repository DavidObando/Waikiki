# Waikiki

[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE) [![](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)](http://dot.net/) [![](https://img.shields.io/badge/language-G%23-blue)](http://github.com/DavidObando/gsharp/)

Waikiki is a desktop app for Windows, macOS and Linux that creates [Yoto](https://yotoplay.com) playlists (MYO cards) for kids from audiobooks and, later, music. It talks directly to Yoto's API.

> **Status: early.** The audiobook flow works in the desktop app (milestones M0 to M4); packaging and music playlists are still to come. See [docs/SPEC.md](docs/SPEC.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Run it
```
dotnet run --project src/Waikiki.App
```
On first launch, open Settings and enter your Yoto client ID, then sign in. Your login is stored in the macOS Keychain, Windows DPAPI or the Linux Secret Service when available.

## Planned features
- Import an unencrypted `.m4b` audiobook, such as one produced by [Oahu](https://github.com/DavidObando/Oahu).
- Split it by chapter, losslessly where possible, into Yoto-compatible tracks.
- Extract the book's cover art and use it as the playlist image.
- Upload the tracks and create or update the card on your Yoto account.
- Music playlists from a folder of audio files (after the audiobook flow).
- Single Avalonia GUI app. No CLI.

## Tech
- Written in [G#](https://github.com/DavidObando/gsharp), targeting .NET 10, with [Avalonia](https://avaloniaui.net) for the UI.
- Requires the .NET 10 SDK. The G# compiler comes in through the `Gsharp.NET.Sdk` NuGet package.

## Yoto setup
Waikiki signs in with OAuth (Authorization Code with PKCE). You need a Yoto developer client:
1. Register an app at <https://dashboard.yoto.dev>.
2. Add the redirect URI listed in [docs/YOTO_API.md](docs/YOTO_API.md) and tick the required scopes.
3. Put the resulting client ID in Waikiki's settings (details will land with the first build).

## Documentation
- [docs/SPEC.md](docs/SPEC.md): product and technical spec
- [docs/YOTO_API.md](docs/YOTO_API.md): Yoto API surface used
- [docs/LICENSING.md](docs/LICENSING.md): why Waikiki is MIT and how it relates to Oahu
- [docs/ROADMAP.md](docs/ROADMAP.md): milestones

## License
[MIT](LICENSE). Waikiki is an independent project and is not affiliated with Yoto.
