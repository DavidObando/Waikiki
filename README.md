# Waikiki

### [⬇ Download the latest version](https://github.com/DavidObando/Waikiki/releases/latest)

**Waikiki turns audiobooks and music from your computer into playlists for your Yoto player.** Pick a book or a folder of songs, press one button, and it appears in your Yoto account, ready to put on a card. It works on Mac, Windows and Linux.

Waikiki is a free hobby project. It is not made by or affiliated with Yoto.

---

## What you can do with it

- **Audiobooks:** Choose an audiobook file (`.m4b`). Waikiki splits it into its chapters, so the Yoto buttons can skip from chapter to chapter, and uses the book's cover picture for the card.
- **Music:** Choose a folder of songs. Each song becomes one track, in the right order, with the album cover if there is one.
- **Tidy up before you send:** Rename tracks, untick the ones you don't want (like "Opening Credits"), change the order of songs, and pick a different cover picture.
- **Safe to interrupt:** If your internet drops halfway through a long book, just press Upload again. Waikiki picks up where it left off, and it updates the same card instead of making a copy.

You need a Yoto account. Waikiki only talks to Yoto. It doesn't collect any information about you or what you listen to.

---

## Install

Open the [latest release](https://github.com/DavidObando/Waikiki/releases/latest) and download the file for your computer from the list under **Assets**. In the file names, `0.1.14` stands for whatever the current version is.

### Mac

1. Download the **`.dmg`** file:
   - **`Waikiki-…-osx-arm64.dmg`** for Macs with an Apple chip (M1, M2, M3 and newer).
   - **`Waikiki-…-osx-x64.dmg`** for older Macs with an Intel chip.
   - Not sure? Click the Apple menu, then **About This Mac**. If it says "Chip: Apple M…", pick arm64. If it says "Processor: Intel…", pick x64.
2. Open the downloaded file and drag **Waikiki** into your **Applications** folder.
3. Open Waikiki from Applications. It is signed and checked by Apple, so it opens like any other app. The first time, your Mac may ask you to confirm that you want to open an app downloaded from the internet; click **Open**.

### Windows

1. Download the **`.zip`** file:
   - **`Waikiki-…-win-x64.zip`** for almost all Windows computers.
   - **`Waikiki-…-win-arm64.zip`** only for ARM-based Windows computers (for example some Surface and Snapdragon laptops).
2. Right-click the zip file and choose **Extract All**, then move the extracted folder somewhere you'll keep it (for example, your Documents folder).
3. Open the folder and double-click **Waikiki.exe**.

Windows may show a blue "Windows protected your PC" window, because this small app isn't from a big company. Click **More info**, then **Run anyway**. You only need to do this once.

### Linux

1. Download the **`.tar.gz`** file: **`Waikiki-…-linux-x64.tar.gz`** for most computers, or **`…-linux-arm64.tar.gz`** for ARM computers such as a Raspberry Pi.
2. Extract it, open the extracted folder in a terminal and run `./Waikiki`.
3. To keep your Yoto login in your desktop's password store, install the `libsecret-tools` package (called `libsecret` on some systems). Without it, Waikiki still works and keeps your login in a private file instead.

---

## Your first card

1. **Sign in.** Click **Sign in to Yoto**. Your web browser opens on Yoto's own sign-in page. Sign in there and approve the request. Waikiki never sees your password.
   - Yoto will say Waikiki is an **unverified app** and show its creator's email address. That is normal for a small hobby project; it's safe to continue if you downloaded Waikiki from this page.
   - After you approve, you can close the browser tab and go back to Waikiki. You'll stay signed in next time.
2. **Choose what to upload.**
   - **Choose audiobook…** and pick your `.m4b` file, or
   - **Choose music folder…** and pick the folder with your songs.
3. **Look it over.** You'll see the cover, the card's title and the list of tracks.
   - Click a title to rename it. Untick a track to leave it out.
   - For music, use the ▲ ▼ buttons to change the order.
   - Click **Choose cover…** if you want a different picture.
4. **Click Upload to Yoto.** A progress bar shows how it's going. A whole book can take a while because Yoto prepares each chapter after it arrives.
5. **Finish in the Yoto app.** When it says **Done**, click **Open in Yoto**, or open your Yoto app and look for the new playlist. Then link it to a card the way you normally do for your own playlists.

---

## Good to know

- **Audiobook files:** Waikiki works with `.m4b` audiobooks that aren't copy-protected. For example, books you've downloaded with [Oahu](https://github.com/DavidObando/Oahu) work well. It can't open copy-protected files.
- **Music files:** MP3, M4A, AAC, WAV, FLAC, Ogg and Opus. Waikiki only looks at the folder you choose, not folders inside it. Songs are sent as they are, and Yoto converts them itself.
- **Limits:** A Yoto card can hold up to 100 tracks. If a track is too big, Waikiki tells you before uploading. Very long chapters are cut into parts automatically.
- **Time:** Waikiki shows song lengths when it can. If it can't tell, Yoto shows the real length after the upload.
- **Where your Yoto login is kept:** In your computer's secure storage (the Mac Keychain, Windows data protection, or the Linux password store). **Settings** shows which one is used. Click **Sign out** to remove it.

---

## If something goes wrong

- **"Sign-in failed" or the Yoto page shows an error about the app:** Yoto may have changed how it accepts Waikiki. Try again later, or check the [releases page](https://github.com/DavidObando/Waikiki/releases) for a newer version. If you're comfortable with it, you can also register your own app at [dashboard.yoto.dev](https://dashboard.yoto.dev) and paste its ID into **Settings**.
- **The upload stopped or the internet dropped:** Press **Upload to Yoto** again. Tracks that already arrived aren't sent twice.
- **"Your Yoto session expired":** Click **Sign in to Yoto** again, then press **Upload to Yoto**.
- **A book has no chapters:** Some files don't contain chapter markers. Waikiki then makes one track, cutting it into parts only if it is too long for Yoto, and tells you so under the cover.
- **Something else:** Please [open an issue](https://github.com/DavidObando/Waikiki/issues) and tell us what you did and what you saw.

---

## For developers

Waikiki is written in [G#](https://github.com/DavidObando/gsharp) on .NET 10, with an [Avalonia](https://avaloniaui.net) interface. Most of the work is split into small libraries:

| Project | What it does |
|---|---|
| `Waikiki.Mp4` | Reads `.m4b`/`.m4a` files (tags, cover, chapters) and cuts them into per-chapter `.m4a` files without re-encoding |
| `Waikiki.Yoto` | Yoto sign-in (OAuth with PKCE), uploads, cover and icon handling, and card creation |
| `Waikiki.Core` | Opens audiobooks and music folders, runs the resumable upload job, and stores your login in the OS secret store |
| `Waikiki.App` | The desktop app |

To run it from source you need the .NET 10 SDK:

```
dotnet run --project src/Waikiki.App
dotnet test Waikiki.slnx
```

Installers are built by GitHub Actions on every push (`build/` has the per-OS scripts). macOS builds are signed with a Developer ID certificate and notarized by Apple; Windows and Linux builds are unsigned.

**About the Yoto sign-in:** The app ships with a built-in Yoto client ID. It isn't a secret (every app that signs in with a browser has one). To use your own, enter it under **Settings**, or set the `WAIKIKI_YOTO_CLIENT_ID` environment variable. Your own ID must be registered as a public client with the redirect URI `http://127.0.0.1:8787/callback` and the content and icon permissions.

More detail:
- [docs/SPEC.md](docs/SPEC.md): how it's designed
- [docs/YOTO_API.md](docs/YOTO_API.md): what we learned about Yoto's API
- [docs/ROADMAP.md](docs/ROADMAP.md): what was built, in order
- [docs/LICENSING.md](docs/LICENSING.md): why Waikiki is MIT

## License

[MIT](LICENSE). Waikiki is an independent project and is not affiliated with Yoto.
