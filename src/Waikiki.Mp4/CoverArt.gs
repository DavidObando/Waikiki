package Waikiki.Mp4

import System

enum CoverFormat {
    Unknown,
    Jpeg,
    Png,
    Bmp
}

/// Embedded cover image bytes.
data class CoverArt {
    init(format CoverFormat, data []uint8) {
        Format = format
        Data = data
    }

    prop Format CoverFormat {
        get;
        init;
    }

    prop Data []uint8 {
        get;
        init;
    }

    prop MimeType string -> switch Format {
        case CoverFormat.Jpeg: "image/jpeg"
        case CoverFormat.Png: "image/png"
        case CoverFormat.Bmp: "image/bmp"
        default: "application/octet-stream"
    }

    shared {
        func Sniff(data []uint8) CoverFormat {
            if data.Length >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
                return CoverFormat.Jpeg
            }
            if data.Length >= 8 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 {
                return CoverFormat.Png
            }
            if data.Length >= 2 && data[0] == 0x42 && data[1] == 0x4D {
                return CoverFormat.Bmp
            }
            return CoverFormat.Unknown
        }
    }
}
