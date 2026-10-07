# Waikiki

[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE) [![](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)](http://dot.net/) [![](https://img.shields.io/badge/language-G%23-blue)](http://github.com/DavidObando/gsharp/)

Waikiki is a desktop app for Windows, macOS and Linux that creates [Yoto](https://yotoplay.com) playlists (MYO cards) for kids from audiobooks and music folders. It talks directly to Yoto's API.

> **Status: early.** Audiobooks and music folders both work in the desktop app, and signed macOS builds come from CI. See [docs/SPEC.md](docs/SPEC.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Run it
```
dotnet run --project src/Waikiki.App
```
Sign in to Yoto, choose a book, and upload. Your login is stored in the macOS Keychain, Windows DPAPI or the Linux Secret Service when available.

## Install
Builds are produced by GitHub Actions for macOS (arm64, x64), Windows (x64, arm64) and Linux (x64, arm64); tagged releases (`v*`) attach them to a GitHub release. To build locally:
```
./build/build-macos.sh      # Waikiki.app, .dmg and .zip in ./artifacts
./build/build-linux.sh      # .tar.gz
./build/build-windows.ps1   # .zip
```
The macOS builds from CI are signed with a Developer ID certificate and notarized by Apple (when the signing secrets are configured); a locally built macOS app is ad-hoc signed and runs on the machine that built it. The Windows and Linux builds are not signed, and Windows SmartScreen may warn on first run.

## Features
- Import an unencrypted `.m4b` audiobook, such as one produced by [Oahu](https://github.com/DavidObando/Oahu).
- Split it by chapter, losslessly where possible, into Yoto-compatible tracks.
- Extract the book's cover art and use it as the playlist image.
- Upload the tracks and create or update the card on your Yoto account.
- Music playlists from a folder of audio files (mp3, m4a, aac, wav, flac, ogg, opus), one track per file, with tags, cover art and reordering.
- Single Avalonia GUI app. No CLI.

## Tech
- Written in [G#](https://github.com/DavidObando/gsharp), targeting .NET 10, with [Avalonia](https://avaloniaui.net) for the UI.
- Requires the .NET 10 SDK. The G# compiler comes in through the `Gsharp.NET.Sdk` NuGet package.

## Yoto sign-in
Waikiki signs in with OAuth (Authorization Code with PKCE) and ships with its own Yoto app registration, so there is nothing to set up: press **Sign in to Yoto**. The first time, Yoto's consent screen may show an "unverified app" warning.

That client ID is not a secret (it is visible in the sign-in URL of every OAuth app). If you build Waikiki yourself, or Yoto ever stops accepting the built-in one, register your own app at <https://dashboard.yoto.dev> (public client, redirect URI `http://127.0.0.1:8787/callback`, scopes for content and icons) and use it in either of these ways. The first one found wins:
1. Settings, "Yoto app registration".
2. The `WAIKIKI_YOTO_CLIENT_ID` environment variable.

## Documentation
- [docs/SPEC.md](docs/SPEC.md): product and technical spec
- [docs/YOTO_API.md](docs/YOTO_API.md): Yoto API surface used
- [docs/LICENSING.md](docs/LICENSING.md): why Waikiki is MIT and how it relates to Oahu
- [docs/ROADMAP.md](docs/ROADMAP.md): milestones

## License
[MIT](LICENSE). Waikiki is an independent project and is not affiliated with Yoto.
