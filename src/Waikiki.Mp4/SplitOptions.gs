package Waikiki.Mp4

import System

/// Limits applied when planning split tracks. Defaults follow Yoto's per-track guidance
/// (roughly 60 minutes / 100 MB), with a little headroom.
class SplitOptions {
    var MaxDuration TimeSpan = TimeSpan.FromMinutes(55.0)
    var MaxBytes int64 = 90 * 1024 * 1024
}
