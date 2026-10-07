package Waikiki.Core.Music

import System
import System.IO
import System.Text

/// Estimates the playing time of an MP3: exact from a Xing/Info frame count when present, otherwise from the
/// first frame's bitrate (right for constant-bitrate files). Only MPEG Layer III is handled; anything else
/// returns nil and Yoto reports the real duration after transcoding.
class Mp3Duration {
    shared {
        private let BitratesMpeg1 []int32 = []int32{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320}
        private let BitratesMpeg2 []int32 = []int32{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160}
        private let SampleRates1 []int32 = []int32{44100, 48000, 32000}
        private let SampleRates2 []int32 = []int32{22050, 24000, 16000}
        private let SampleRates25 []int32 = []int32{11025, 12000, 8000}

        func Estimate(stream Stream, audioStart int64) TimeSpan? {
            // Find the first frame sync within a window after the tag.
            let window = [8192]uint8
            stream.Position = Math.Min(audioStart, stream.Length)
            let read = stream.Read(window, 0, window.Length)
            var i int32 = 0
            while i + 4 <= read {
                if window[i] == 0xFF && (window[i + 1] & 0xE0) == 0xE0 {
                    let result = ParseFrame(window, i, read, stream.Length - audioStart - int64(i))
                    if result != nil {
                        return result
                    }
                }
                i++
            }
            return nil
        }

        private func ParseFrame(b []uint8, p int32, read int32, audioBytes int64) TimeSpan? {
            let versionBits = (int32(b[p + 1]) >> 3) & 3
            let layerBits = (int32(b[p + 1]) >> 1) & 3
            let bitrateIndex = (int32(b[p + 2]) >> 4) & 15
            let rateIndex = (int32(b[p + 2]) >> 2) & 3
            if versionBits == 1 || layerBits != 1 || bitrateIndex == 0 || bitrateIndex == 15 || rateIndex == 3 {
                return nil
            }
            let mpeg1 = versionBits == 3
            let sampleRate = if mpeg1 { SampleRates1[rateIndex] } else { if versionBits == 2 { SampleRates2[rateIndex] } else { SampleRates25[rateIndex] } }
            let bitrate = (if mpeg1 { BitratesMpeg1[bitrateIndex] } else { BitratesMpeg2[bitrateIndex] }) * 1000
            let samplesPerFrame = if mpeg1 { 1152 } else { 576 }
            let mono = ((int32(b[p + 3]) >> 6) & 3) == 3
            let sideInfo = if mpeg1 { if mono { 17 } else { 32 } } else { if mono { 9 } else { 17 } }
            let xing = p + 4 + sideInfo
            if xing + 12 <= read {
                let tag = Encoding.Latin1.GetString(b, xing, 4)
                if (tag == "Xing" || tag == "Info") && (b[xing + 7] & 1) != 0 {
                    let frames = (int64(b[xing + 8]) << 24) | (int64(b[xing + 9]) << 16) | (int64(b[xing + 10]) << 8) | int64(b[xing + 11])
                    return TimeSpan.FromSeconds(float64(frames) * float64(samplesPerFrame) / float64(sampleRate))
                }
            }
            if audioBytes <= 0 {
                return nil
            }
            return TimeSpan.FromSeconds(float64(audioBytes) * 8.0 / float64(bitrate))
        }
    }
}
