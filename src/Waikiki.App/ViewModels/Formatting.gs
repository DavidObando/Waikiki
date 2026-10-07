package Waikiki.App.ViewModels

import System
import System.Globalization

class Formatting {
    shared {
        func Duration(d TimeSpan) string {
            if d.TotalHours >= 1.0 {
                return "${int32(d.TotalHours)}:${d.Minutes:D2}:${d.Seconds:D2}"
            }
            return "${d.Minutes}:${d.Seconds:D2}"
        }

        func Size(bytes int64) string {
            let mb = float64(bytes) / (1024.0 * 1024.0)
            if mb >= 1.0 {
                return mb.ToString("0.0", CultureInfo.InvariantCulture) + " MB"
            }
            return (float64(bytes) / 1024.0).ToString("0", CultureInfo.InvariantCulture) + " KB"
        }
    }
}
