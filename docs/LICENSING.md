# Licensing

Waikiki is MIT-licensed. [Oahu](https://github.com/DavidObando/Oahu) is GPL-3.0 and stays that way.

## Why Oahu is not being relicensed
- "Dual MIT + GPL" is, for downstream users, the same as MIT: they could pick MIT. It therefore needs exactly the same consent as a full switch.
- Consent would be needed from:
  - audiamus, the original BookLibConnect author (about 28 commits across two identities). Oahu is a fork of that work.
  - Two contributors with one commit each (Adrian Petrescu, Matt Hoosier).
  - Possibly Mbucari: `Oahu.Decrypt` appears to derive from AAXClean, whose license has not been verified.
  - Possibly Microsoft, for commits made under a Microsoft email, depending on employer IP terms.
- A GPL package consumed by Waikiki would make Waikiki GPL in practice.

## What this means for Waikiki
- Waikiki has no dependency on any Oahu package.
- Waikiki ships its own MP4/M4B library (`Waikiki.Mp4`), written for this project. It only reads unencrypted files, so no Audible decryption code is needed.
- **Consult, don't copy.** Reading Oahu's MP4 code to understand how it works is fine. Copying or porting code from `Oahu.Decrypt` into Waikiki is not, because that would put GPL-derived code in an MIT repo.
- Primary references: ISO/IEC 14496-12 (ISO BMFF), the QuickTime/Apple file format docs, and observed Yoto behavior.

## Revisiting
If Oahu's contributors and upstream authors ever agree to relicense, or the reusable parts are extracted and relicensed, Waikiki could consume them as NuGet packages. Not planned.

Third-party dependencies must be permissive (MIT/Apache/BSD). Check licenses such as SixLabors.ImageSharp (Split License) before adding.
